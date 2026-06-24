import { Injectable, OnApplicationBootstrap, OnApplicationShutdown, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WhatsappCampaign, WhatsappCampaignDocument } from '../schemas/whatsapp-campaign.schema';
import { AuditLogEmitter } from '../../audit-logs/audit-log-emitter';

@Injectable()
export class WhatsappCampaignSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsappCampaignSchedulerService.name);
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(WhatsappCampaign.name)
    private readonly campaignModel: Model<WhatsappCampaignDocument>,
    @InjectQueue('whatsapp-campaign-queue')
    private readonly campaignQueue: Queue,
    private readonly auditLogEmitter: AuditLogEmitter,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('WhatsappCampaignSchedulerService initialized. Chronological polling started (every 30 seconds).');
    this.intervalId = setInterval(() => this.pollScheduledCampaigns(), 30000);
  }

  onApplicationShutdown() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('WhatsappCampaignSchedulerService shutdown. Chronological polling stopped.');
    }
  }

  async pollScheduledCampaigns() {
    try {
      const now = new Date();
      // Find campaigns scheduled in the past or now, which are still in 'scheduled' status
      const scheduledCampaigns = await this.campaignModel
        .find({
          status: 'scheduled',
          scheduledAt: { $lte: now },
          isDeleted: { $ne: true },
        })
        .exec();

      if (scheduledCampaigns.length === 0) {
        return;
      }

      this.logger.log(`Found ${scheduledCampaigns.length} scheduled WhatsApp campaigns ready for processing.`);
      const client: any = await this.campaignQueue.client;

      for (const campaign of scheduledCampaigns) {
        const campaignId = campaign._id.toString();
        const lockKey = `lock:wa:campaign:${campaignId}`;

        // Attempt to acquire a distributed lock in Redis for 10 minutes (600,000ms)
        const acquired = await client.set(lockKey, '1', 'PX', 600000, 'NX');

        if (acquired === 'OK') {
          this.logger.log(`Acquired lock for WhatsApp campaign ${campaignId}. Dispatching job to queue.`);

          // Update status to 'sending' and set startedAt
          campaign.status = 'sending';
          campaign.startedAt = now;
          await campaign.save();

          // Push to BullMQ queue
          await this.campaignQueue.add('dispatch-campaign', {
            campaignId,
            orgId: campaign.organizationId.toString(),
          });

          // Log audit log
          this.auditLogEmitter.emit('audit.log', {
            orgId: campaign.organizationId.toString(),
            userId: campaign.createdById?.toString() || 'system',
            action: 'whatsapp_campaign.dispatched',
            description: `Scheduled WhatsApp campaign "${campaign.name}" dispatched to sending queue.`,
            metadata: { campaignId },
          });
        } else {
          this.logger.warn(`Could not acquire lock for WhatsApp campaign ${campaignId}. Process might already be active.`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error occurred while polling scheduled WhatsApp campaigns: ${err.message}`, err.stack);
    }
  }
}
