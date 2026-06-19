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

      this.logger.log(`Found ${contacts.length} recipients. Queueing sending jobs.`);

      // 2. Clear out any existing recipients for this campaign (in case of retry/resume)
      await this.recipientModel.deleteMany({ campaignId: campaign._id }).exec();

      // 3. Bulk insert recipients
      const recipientDocs = contacts.map(contact => ({
        organizationId: campaign.organizationId,
        campaignId: campaign._id,
        contactId: contact._id,
        email: contact.email,
        status: 'pending',
      }));

      const createdRecipients = await this.recipientModel.insertMany(recipientDocs);

      // Update totalRecipients to reflect actual inserted count
      campaign.totalRecipients = createdRecipients.length;
      campaign.status = 'sending';
      await campaign.save();

      // 4. Bulk queue send-email jobs
      const emailJobs = createdRecipients.map(rec => ({
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

      await this.sendEmailQueue.addBulk(emailJobs);
      this.logger.log(`Successfully queued ${emailJobs.length} email sending jobs for campaign ${campaignId}.`);

    } catch (err: any) {
      this.logger.error(`Failed to compile and queue campaign ${campaignId}: ${err.message}`, err.stack);
      campaign.status = 'paused'; // Transition to paused on compilation failures
      await campaign.save();
      throw err;
    }
  }
}
