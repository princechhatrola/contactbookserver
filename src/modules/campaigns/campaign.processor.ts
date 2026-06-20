import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Logger } from '@nestjs/common';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { CampaignRecipient, CampaignRecipientDocument } from './schemas/campaign-recipient.schema';
import { AudienceCompilerService } from './services/audience-compiler.service';

@Processor('campaign-queue')
export class CampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(CampaignRecipient.name)
    private readonly recipientModel: Model<CampaignRecipientDocument>,
    private readonly audienceCompilerService: AudienceCompilerService,
    @InjectQueue('send-email-queue')
    private readonly sendEmailQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { campaignId, orgId } = job.data;
    this.logger.log(`Processing campaign dispatch for campaign ${campaignId} in organization ${orgId}`);

    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new Error(`Campaign with ID ${campaignId} not found.`);
    }

    // Double check status: if cancelled or completed, skip.
    if (campaign.status === 'cancelled' || campaign.status === 'completed') {
      this.logger.warn(`Campaign ${campaignId} is in "${campaign.status}" state. Skipping dispatch.`);
      return;
    }

    try {
      // 1. Compile Segment Recipients
      const contacts = await this.audienceCompilerService.compileSegment(orgId, campaign.segmentFilters);
      
      if (contacts.length === 0) {
        this.logger.log(`No contacts matched segment filters for campaign ${campaignId}. Marking as completed.`);
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        await campaign.save();
        return;
      }

      this.logger.log(`Found ${contacts.length} recipients for campaign ${campaignId}.`);

      // 2. Fetch existing recipients to avoid duplicates
      const existingRecipients = await this.recipientModel.find({ campaignId: campaign._id }).exec();
      const existingMap = new Map(existingRecipients.map(r => [r.contactId.toString(), r]));
      const compiledContactIds = new Set(contacts.map(c => c._id.toString()));

      // 3. Clean up any pending recipients that are no longer in the compiled segment
      const pendingRecipientsToDelete = existingRecipients.filter(
        r => r.status === 'pending' && !compiledContactIds.has(r.contactId.toString())
      );
      if (pendingRecipientsToDelete.length > 0) {
        const deleteIds = pendingRecipientsToDelete.map(r => r._id);
        await this.recipientModel.deleteMany({ _id: { $in: deleteIds } }).exec();
      }

      // 4. Distinguish between new recipients and existing pending ones
      const toInsert = [];
      const toQueue = [];

      for (const contact of contacts) {
        const existing = existingMap.get(contact._id.toString());
        if (existing) {
          if (existing.status === 'pending') {
            toQueue.push(existing);
          }
          // If status is 'sent', 'failed', 'bounced', etc. - skip queueing to avoid duplicates
        } else {
          toInsert.push(contact);
        }
      }

      this.logger.log(`New recipients to insert: ${toInsert.length}. Existing pending to queue: ${toQueue.length}.`);

      // 5. Bulk insert newly matching recipients
      let insertedRecipients = [];
      if (toInsert.length > 0) {
        const recipientDocs = toInsert.map(contact => ({
          organizationId: campaign.organizationId,
          campaignId: campaign._id,
          contactId: contact._id,
          email: contact.email,
          status: 'pending',
        }));
        insertedRecipients = await this.recipientModel.insertMany(recipientDocs);
      }

      // Combine existing pending and newly inserted recipients to queue
      const recipientsToQueue = [...toQueue, ...insertedRecipients];

      // 6. Update totalRecipients count based on all recipients in DB
      const totalRecipientsCount = await this.recipientModel.countDocuments({ campaignId: campaign._id }).exec();
      campaign.totalRecipients = totalRecipientsCount;
      campaign.status = 'sending';
      await campaign.save();

      // 7. Bulk queue send-email jobs only for pending/new recipients
      const emailJobs = recipientsToQueue.map(rec => ({
        name: 'send-email',
        data: {
          recipientId: rec._id.toString(),
          campaignId: campaign._id.toString(),
          orgId: campaign.organizationId.toString(),
          contactId: rec.contactId.toString(),
          email: rec.email,
        },
        opts: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 60000, // 1 minute base backoff
          },
        },
      }));

      if (emailJobs.length > 0) {
        await this.sendEmailQueue.addBulk(emailJobs);
        this.logger.log(`Successfully queued ${emailJobs.length} email sending jobs for campaign ${campaignId}.`);
      } else {
        this.logger.log(`No pending jobs to queue for campaign ${campaignId}.`);
      }

    } catch (err: any) {
      this.logger.error(`Failed to compile and queue campaign ${campaignId}: ${err.message}`, err.stack);
      campaign.status = 'paused'; // Transition to paused on compilation failures
      await campaign.save();
      throw err;
    }
  }
}
