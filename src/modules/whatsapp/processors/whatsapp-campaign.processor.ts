import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Logger } from '@nestjs/common';
import { WhatsappCampaign, WhatsappCampaignDocument } from '../schemas/whatsapp-campaign.schema';
import { WhatsappCampaignRecipient, WhatsappCampaignRecipientDocument } from '../schemas/whatsapp-campaign-recipient.schema';
import { WhatsappAudienceCompilerService } from '../services/whatsapp-audience-compiler.service';

@Processor('whatsapp-campaign-queue')
export class WhatsappCampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappCampaignProcessor.name);

  constructor(
    @InjectModel(WhatsappCampaign.name)
    private readonly campaignModel: Model<WhatsappCampaignDocument>,
    @InjectModel(WhatsappCampaignRecipient.name)
    private readonly recipientModel: Model<WhatsappCampaignRecipientDocument>,
    private readonly audienceCompilerService: WhatsappAudienceCompilerService,
    @InjectQueue('send-whatsapp-queue')
    private readonly sendWhatsappQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { campaignId, orgId } = job.data;
    this.logger.log(`Processing WhatsApp Campaign compiled segments for campaign ${campaignId}`);

    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new Error(`WhatsApp campaign with ID ${campaignId} not found.`);
    }

    if (campaign.status === 'cancelled' || campaign.status === 'completed') {
      this.logger.warn(`WhatsApp campaign ${campaignId} is in "${campaign.status}" state. Skipping dispatch.`);
      return;
    }

    try {
      // 1. Match CRM Contacts based on filters
      const contacts = await this.audienceCompilerService.compileSegment(orgId, campaign.segmentFilters);
      
      // Filter out contacts without a phone number
      const contactsWithPhone = contacts.filter(c => !!c.mobile);

      if (contactsWithPhone.length === 0) {
        this.logger.log(`No contacts with phone numbers matched segment filters for WhatsApp campaign ${campaignId}. Marking as completed.`);
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        await campaign.save();
        return;
      }

      this.logger.log(`Found ${contactsWithPhone.length} recipients for WhatsApp campaign ${campaignId}.`);

      // 2. Fetch existing recipients to avoid duplicates
      const existingRecipients = await this.recipientModel.find({ whatsappCampaignId: campaign._id }).exec();
      const existingMap = new Map(existingRecipients.map(r => [r.contactId.toString(), r]));
      const compiledContactIds = new Set(contactsWithPhone.map(c => c._id.toString()));

      // Clean up any pending recipients that are no longer in the compiled segment
      const pendingRecipientsToDelete = existingRecipients.filter(
        r => r.status === 'pending' && !compiledContactIds.has(r.contactId.toString())
      );
      if (pendingRecipientsToDelete.length > 0) {
        const deleteIds = pendingRecipientsToDelete.map(r => r._id);
        await this.recipientModel.deleteMany({ _id: { $in: deleteIds } }).exec();
      }

      const toInsert: any[] = [];
      const toQueue: WhatsappCampaignRecipientDocument[] = [];

      for (const contact of contactsWithPhone) {
        const existing = existingMap.get(contact._id.toString());
        if (existing) {
          if (existing.status === 'pending') {
            toQueue.push(existing);
          }
        } else {
          toInsert.push(contact);
        }
      }

      this.logger.log(`New WhatsApp recipients to insert: ${toInsert.length}. Existing pending to queue: ${toQueue.length}.`);

      let insertedRecipients: WhatsappCampaignRecipientDocument[] = [];
      if (toInsert.length > 0) {
        const recipientDocs = toInsert.map(contact => ({
          organizationId: campaign.organizationId,
          whatsappCampaignId: campaign._id,
          contactId: contact._id,
          phoneNumber: contact.mobile,
          status: 'pending',
        }));
        insertedRecipients = await this.recipientModel.insertMany(recipientDocs);
      }

      const recipientsToQueue = [...toQueue, ...insertedRecipients];

      const totalRecipientsCount = await this.recipientModel.countDocuments({ whatsappCampaignId: campaign._id }).exec();
      campaign.totalRecipients = totalRecipientsCount;
      campaign.status = 'sending';
      await campaign.save();

      // 3. Queue Send Whatsapp message jobs
      const jobs = recipientsToQueue.map(rec => ({
        name: 'send-whatsapp',
        data: {
          recipientId: rec._id.toString(),
          campaignId: campaign._id.toString(),
          orgId: orgId,
          contactId: rec.contactId.toString(),
          phoneNumber: rec.phoneNumber,
        },
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 30000, // 30s base backoff
          },
        },
      }));

      if (jobs.length > 0) {
        await this.sendWhatsappQueue.addBulk(jobs);
        this.logger.log(`Queued ${jobs.length} sending jobs for WhatsApp campaign ${campaignId}`);
      } else {
        this.logger.log(`No pending jobs to queue for WhatsApp campaign ${campaignId}.`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to compile and queue WhatsApp campaign ${campaignId}: ${err.message}`, err.stack);
      campaign.status = 'paused';
      await campaign.save();
      throw err;
    }
  }
}
