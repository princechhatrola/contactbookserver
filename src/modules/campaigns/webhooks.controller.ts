import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Public } from '../../common/decorators/public.decorator';
import { CampaignRecipient, CampaignRecipientDocument } from './schemas/campaign-recipient.schema';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { SuppressionListService } from './services/suppression-list.service';
import { SuppressionReason } from './schemas/suppression-list.schema';

@ApiTags('Provider Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    @InjectModel(CampaignRecipient.name)
    private readonly recipientModel: Model<CampaignRecipientDocument>,
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    private readonly suppressionService: SuppressionListService,
  ) {}

  @Post('sendgrid')
  @Public()
  @ApiOperation({ summary: 'Receive SendGrid event status reports' })
  async handleSendGrid(@Body() events: any[]) {
    if (Array.isArray(events)) {
      for (const ev of events) {
        const email = ev.email;
        const eventType = ev.event;
        const recipientId = ev.recipientId;
        const campaignId = ev.campaignId;

        if (eventType === 'bounce') {
          await this.updateRecipientStatus(recipientId, campaignId, email, 'bounced', 'SendGrid Webhook: Hard Bounce');
        } else if (eventType === 'spamreport') {
          await this.updateRecipientStatus(recipientId, campaignId, email, 'complaint', 'SendGrid Webhook: Spam Complaint');
        }
      }
    }
    return { ok: true };
  }

  @Post('resend')
  @Public()
  @ApiOperation({ summary: 'Receive Resend email status reports' })
  async handleResend(@Body() payload: any) {
    const eventType = payload.type;
    const data = payload.data;
    if (data && data.to && Array.isArray(data.to)) {
      const email = data.to[0];
      const headers = data.headers || {};
      const recipientId = headers['x-recipient-id'];
      const campaignId = headers['x-campaign-id'];

      if (eventType === 'email.bounced') {
        await this.updateRecipientStatus(recipientId, campaignId, email, 'bounced', 'Resend Webhook: Email Bounced');
      } else if (eventType === 'email.complained') {
        await this.updateRecipientStatus(recipientId, campaignId, email, 'complaint', 'Resend Webhook: Spam Complaint');
      }
    }
    return { ok: true };
  }

  @Post('mailgun')
  @Public()
  @ApiOperation({ summary: 'Receive Mailgun delivery events' })
  async handleMailgun(@Body() payload: any) {
    const eventData = payload['event-data'];
    if (eventData) {
      const email = eventData.recipient;
      const eventType = eventData.event;
      const severity = eventData.severity;
      const userVars = eventData['user-variables'] || {};
      const recipientId = userVars.recipientId;
      const campaignId = userVars.campaignId;

      if (eventType === 'failed' && severity === 'permanent') {
        await this.updateRecipientStatus(recipientId, campaignId, email, 'bounced', 'Mailgun Webhook: Hard Bounce');
      } else if (eventType === 'complained') {
        await this.updateRecipientStatus(recipientId, campaignId, email, 'complaint', 'Mailgun Webhook: Spam Complaint');
      }
    }
    return { ok: true };
  }

  @Post('ses')
  @Public()
  @ApiOperation({ summary: 'Receive Amazon SES delivery notifications' })
  async handleSes(@Body() payload: any) {
    if (payload.Type === 'SubscriptionConfirmation') {
      const confirmUrl = payload.SubscribeURL;
      if (confirmUrl) {
        await fetch(confirmUrl);
      }
      return { ok: true };
    }

    const message = typeof payload.Message === 'string' ? JSON.parse(payload.Message) : payload;
    const notificationType = message.notificationType;

    if (notificationType === 'Bounce') {
      const bounce = message.bounce;
      if (bounce && bounce.bounceType === 'Permanent') {
        const recipients = bounce.bouncedRecipients || [];
        for (const rec of recipients) {
          const email = rec.emailAddress;
          const mailHeaders = message.mail?.headers || [];
          const campaignId = mailHeaders.find((h: any) => h.name.toLowerCase() === 'x-campaign-id')?.value;
          const recipientId = mailHeaders.find((h: any) => h.name.toLowerCase() === 'x-recipient-id')?.value;
          await this.updateRecipientStatus(recipientId, campaignId, email, 'bounced', 'Amazon SES Webhook: Hard Bounce');
        }
      }
    } else if (notificationType === 'Complaint') {
      const complaint = message.complaint;
      const recipients = complaint.complainedRecipients || [];
      for (const rec of recipients) {
        const email = rec.emailAddress;
        const mailHeaders = message.mail?.headers || [];
        const campaignId = mailHeaders.find((h: any) => h.name.toLowerCase() === 'x-campaign-id')?.value;
        const recipientId = mailHeaders.find((h: any) => h.name.toLowerCase() === 'x-recipient-id')?.value;
        await this.updateRecipientStatus(recipientId, campaignId, email, 'complaint', 'Amazon SES Webhook: Spam Complaint');
      }
    }
    return { ok: true };
  }

  private async suppressEmail(orgId: string, email: string, reason: SuppressionReason) {
    await this.suppressionService.add(orgId, {
      email,
      reason,
    });
  }

  private async updateRecipientStatus(
    recipientId: string,
    campaignId: string,
    email: string,
    status: 'bounced' | 'complaint',
    errorMsg: string,
  ) {
    let rec: any = null;

    if (Types.ObjectId.isValid(recipientId)) {
      rec = await this.recipientModel.findById(recipientId).exec();
    } else if (Types.ObjectId.isValid(campaignId) && email) {
      rec = await this.recipientModel.findOne({
        campaignId: new Types.ObjectId(campaignId),
        email: email.trim().toLowerCase(),
      }).exec();
    } else if (email) {
      rec = await this.recipientModel.findOne({
        email: email.trim().toLowerCase(),
        status: { $in: ['sent', 'pending', 'sending'] },
      }).sort({ createdAt: -1 }).exec();
    }

    if (rec) {
      if (rec.status !== status) {
        const oldStatus = rec.status;
        rec.status = status;
        rec.error = errorMsg;
        await rec.save();

        const updateObj: any = { $inc: { failedRecipients: 1 } };
        if (oldStatus === 'sent') {
          updateObj.$inc.sentRecipients = -1;
        }
        await this.campaignModel.findByIdAndUpdate(rec.campaignId, updateObj).exec();

        const suppressionReason = status === 'bounced' ? SuppressionReason.BOUNCE_HARD : SuppressionReason.COMPLAINT;
        await this.suppressEmail(rec.organizationId.toString(), rec.email, suppressionReason);
      }
    }
  }
}
