import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Logger } from '@nestjs/common';
import { WhatsappCampaign, WhatsappCampaignDocument } from '../schemas/whatsapp-campaign.schema';
import { WhatsappCampaignRecipient, WhatsappCampaignRecipientDocument } from '../schemas/whatsapp-campaign-recipient.schema';
import { WhatsappProvider, WhatsappProviderDocument, WhatsappProviderStatus } from '../schemas/whatsapp-provider.schema';
import { Contact, ContactDocument } from '../../contacts/schemas/contact.schema';
import { WhatsappSessionManager } from '../services/whatsapp-session-manager.service';

@Processor('send-whatsapp-queue')
export class SendWhatsappProcessor extends WorkerHost {
  private readonly logger = new Logger(SendWhatsappProcessor.name);

  constructor(
    @InjectModel(WhatsappCampaign.name)
    private readonly campaignModel: Model<WhatsappCampaignDocument>,
    @InjectModel(WhatsappCampaignRecipient.name)
    private readonly recipientModel: Model<WhatsappCampaignRecipientDocument>,
    @InjectModel(WhatsappProvider.name)
    private readonly providerModel: Model<WhatsappProviderDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    private readonly sessionManager: WhatsappSessionManager,
    @InjectQueue('send-whatsapp-queue')
    private readonly sendWhatsappQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { recipientId, campaignId, orgId, contactId, phoneNumber } = job.data;
    this.logger.log(`Processing WhatsApp send job to ${phoneNumber} for campaign ${campaignId}`);

    const client: any = await this.sendWhatsappQueue.client;
    const lockKey = `lock:wa:recipient:${recipientId}`;
    
    // Acquire a 5-day lock to prevent concurrent processing of the same recipient log
    const acquired = await client.set(lockKey, '1', 'PX', 432000000, 'NX');
    if (acquired !== 'OK') {
      this.logger.warn(`WhatsApp recipient ${recipientId} is currently being processed. Skipping.`);
      return;
    }

    const releaseLock = async () => {
      try {
        await client.del(lockKey);
      } catch (err: any) {
        this.logger.error(`Failed to release lock ${lockKey}: ${err.message}`);
      }
    };

    try {
      // 1. Fetch recipient log
      const recipient = await this.recipientModel.findById(recipientId).exec();
      if (!recipient) {
        this.logger.warn(`Recipient log ${recipientId} not found in DB. Aborting.`);
        await releaseLock();
        return;
      }

      if (recipient.status !== 'pending') {
        this.logger.warn(`Recipient ${recipientId} has status "${recipient.status}" (not "pending"). Aborting.`);
        await releaseLock();
        return;
      }

      // 2. Fetch campaign
      const campaign = await this.campaignModel.findById(campaignId).exec();
      if (!campaign || campaign.status === 'paused' || campaign.status === 'cancelled' || campaign.isDeleted) {
        this.logger.warn(`Campaign ${campaignId} is paused, cancelled, or deleted. Aborting.`);
        await releaseLock();
        return;
      }

      // 3. Select active provider with rate limit budget (with auto-rotation)
      const selectedProvider = await this.selectProviderWithBudget(client, orgId, campaign);
      if (!selectedProvider) {
        await releaseLock();
        // Throw error to trigger BullMQ backoff retry
        throw new Error(`WhatsApp limits exceeded for all active providers in org ${orgId}. Requeueing...`);
      }

      // 4. Fetch contact info
      const contact = await this.contactModel.findById(contactId).exec();
      if (!contact) {
        this.logger.error(`Contact ID ${contactId} not found.`);
        await this.recipientModel.findByIdAndUpdate(recipientId, {
          status: 'failed',
          error: 'Contact not found.',
        }).exec();
        await this.campaignModel.findByIdAndUpdate(campaignId, { $inc: { failedRecipients: 1 } }).exec();
        await this.checkCampaignCompletion(campaignId);
        await releaseLock();
        return;
      }

      try {
        // 5. Personalize template variables
        let compiledText = this.compileVariables(campaign.messageBody, contact);
        
        // 6. Resolve Spintax to ensure message variation
        compiledText = this.resolveSpintax(compiledText);

        // 7. Initialize Baileys dynamic connection instance
        const socket = await this.sessionManager.getSocket(selectedProvider._id.toString());
        
        // Standardize JID format for WhatsApp
        const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;

        // 8. Safe sending jitter (typing simulated status + delay)
        this.logger.log(`Simulating typing status to ${jid} for provider ${selectedProvider.phoneNumber}...`);
        await socket.sendPresenceUpdate('composing', jid);
        const typingJitter = Math.floor(Math.random() * 2000) + 2000; // 2s - 4s typing presence
        await this.sleep(typingJitter);

        // Add a randomized delay before sending the message
        const delayJitter = Math.floor(Math.random() * 10000) + 5000; // 5s - 15s random delay
        await this.sleep(delayJitter);

        // 9. Dispatch the WhatsApp Message
        await socket.sendMessage(jid, { text: compiledText });

        this.logger.log(`Successfully sent WhatsApp message to ${jid} from ${selectedProvider.phoneNumber}`);

        // 10. Update Recipient Log status
        await this.recipientModel.findByIdAndUpdate(recipientId, {
          status: 'sent',
          sentAt: new Date(),
          sentFromProviderId: selectedProvider._id,
        }).exec();

        await this.campaignModel.findByIdAndUpdate(campaignId, { $inc: { sentRecipients: 1 } }).exec();

      } catch (err: any) {
        this.logger.error(`Failed to send WhatsApp message to ${phoneNumber}: ${err.message}`, err.stack);
        await this.recipientModel.findByIdAndUpdate(recipientId, {
          status: 'failed',
          error: err.message || 'Unknown dispatch error',
        }).exec();

        await this.campaignModel.findByIdAndUpdate(campaignId, { $inc: { failedRecipients: 1 } }).exec();
      } finally {
        await this.checkCampaignCompletion(campaignId);
        await releaseLock();
      }

    } catch (outerErr) {
      await releaseLock();
      throw outerErr;
    }
  }

  private async selectProviderWithBudget(
    client: any,
    orgId: string,
    campaign: WhatsappCampaignDocument,
  ): Promise<WhatsappProviderDocument | null> {
    
    // If a static provider is selected and auto-rotate is disabled
    if (campaign.whatsappProviderId && !campaign.autoRotate) {
      const provider = await this.providerModel.findOne({
        _id: campaign.whatsappProviderId,
        organizationId: new Types.ObjectId(orgId),
        status: WhatsappProviderStatus.CONNECTED,
        isDeleted: { $ne: true },
      }).exec();

      if (provider && await this.checkAndIncrementLimits(client, provider)) {
        return provider;
      }
      return null;
    }

    // Auto-rotation selection: load all active connected providers
    const activeProviders = await this.providerModel.find({
      organizationId: new Types.ObjectId(orgId),
      status: WhatsappProviderStatus.CONNECTED,
      isDeleted: { $ne: true },
    }).sort({ priority: 1 }).exec();

    for (const provider of activeProviders) {
      const allowed = await this.checkAndIncrementLimits(client, provider);
      if (allowed) {
        return provider;
      }
    }

    return null;
  }

  private async checkAndIncrementLimits(client: any, provider: WhatsappProviderDocument): Promise<boolean> {
    const providerId = provider._id.toString();
    const minKey = `rate:wa:${providerId}:min`;
    const hourKey = `rate:wa:${providerId}:hour`;
    const dayKey = `rate:wa:${providerId}:day`;

    const limitMin = provider.rateLimitPerMin || 10;
    const limitHour = provider.hourlyLimit || 200;
    const limitDay = provider.dailyLimit || 1000;

    const [minCount, hourCount, dayCount] = await Promise.all([
      client.get(minKey),
      client.get(hourKey),
      client.get(dayKey),
    ]);

    if (Number(minCount || 0) >= limitMin) return false;
    if (limitHour > 0 && Number(hourCount || 0) >= limitHour) return false;
    if (limitDay > 0 && Number(dayCount || 0) >= limitDay) return false;

    // Increment and apply TTLs
    const newMin = await client.incr(minKey);
    if (newMin === 1) await client.expire(minKey, 60);

    const newHour = await client.incr(hourKey);
    if (newHour === 1) await client.expire(hourKey, 3600);

    const newDay = await client.incr(dayKey);
    if (newDay === 1) await client.expire(dayKey, 86400);

    return true;
  }

  private compileVariables(text: string, contact: ContactDocument): string {
    return text
      .replace(/\{\{firstName\}\}/gi, contact.firstName || '')
      .replace(/\{\{lastName\}\}/gi, contact.lastName || '')
      .replace(/\{\{phone\}\}/gi, contact.mobile || '')
      .replace(/\{\{company\}\}/gi, contact.company || '');
  }

  private resolveSpintax(text: string): string {
    // Matches {option1|option2|option3} recursively
    return text.replace(/\{([^{}]+)\}/g, (match, choicesStr) => {
      const choices = choicesStr.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
  }

  private async checkCampaignCompletion(campaignId: string) {
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (!campaign) return;

    const pendingCount = await this.recipientModel.countDocuments({
      whatsappCampaignId: campaign._id,
      status: 'pending',
    }).exec();

    if (pendingCount === 0) {
      campaign.status = 'completed';
      campaign.completedAt = new Date();
      await campaign.save();
      this.logger.log(`WhatsApp Campaign ${campaignId} sending completed. Total: ${campaign.totalRecipients}.`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
