import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Logger, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { CampaignRecipient, CampaignRecipientDocument } from './schemas/campaign-recipient.schema';
import { EmailProvider, EmailProviderDocument, ProviderType, ProviderStatus } from './schemas/email-provider.schema';
import { SenderIdentity, SenderIdentityDocument } from './schemas/sender-identity.schema';
import { Contact, ContactDocument } from '../contacts/schemas/contact.schema';
import { SuppressionListService } from './services/suppression-list.service';
import { EmailTemplatesService } from './services/email-templates.service';
import { EmailProvidersService } from './services/email-providers.service';

@Processor('send-email-queue')
export class SendEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendEmailProcessor.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(CampaignRecipient.name)
    private readonly recipientModel: Model<CampaignRecipientDocument>,
    @InjectModel(EmailProvider.name)
    private readonly providerModel: Model<EmailProviderDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    private readonly suppressionService: SuppressionListService,
    private readonly templatesService: EmailTemplatesService,
    private readonly emailProvidersService: EmailProvidersService,
    @InjectQueue('send-email-queue')
    private readonly sendEmailQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { recipientId, campaignId, orgId, contactId, email } = job.data;
    this.logger.log(`Processing email send job to ${email} for campaign ${campaignId}`);

    const client = await this.sendEmailQueue.client;
    const lockKey = `lock:recipient:${recipientId}`;
    
    // Acquire a 5-day lock to prevent concurrent workers processing the same recipient
    const acquired = await client.set(lockKey, '1', 'PX', 432000000, 'NX');
    if (acquired !== 'OK') {
      this.logger.warn(`Recipient ${recipientId} is currently being processed by another worker. Skipping.`);
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
      // 1. Fetch individual recipient log to check status
      const recipient = await this.recipientModel.findById(recipientId).exec();
      if (!recipient) {
        this.logger.warn(`Recipient log ${recipientId} not found in DB. Aborting send job.`);
        await releaseLock();
        return;
      }

      if (recipient.status !== 'pending') {
        this.logger.warn(`Recipient ${recipientId} already has status "${recipient.status}" (not "pending"). Aborting to prevent duplicate email.`);
        await releaseLock();
        return;
      }

      // 2. Check Campaign Lifecycle Status
      const campaign = await this.campaignModel.findById(campaignId).exec();
      if (!campaign || campaign.status === 'paused' || campaign.status === 'cancelled' || campaign.isDeleted) {
        this.logger.warn(`Campaign ${campaignId} is paused, cancelled, or deleted. Aborting send job.`);
        await releaseLock();
        return;
      }

      // 3. Check Suppression List
      const isSuppressed = await this.suppressionService.isSuppressed(orgId, email);
      if (isSuppressed) {
        this.logger.warn(`Recipient email ${email} is suppressed. Skipping send.`);
        await this.recipientModel.findByIdAndUpdate(recipientId, {
          status: 'failed',
          error: 'Email address is in the suppression list.',
        }).exec();
        await this.campaignModel.findByIdAndUpdate(campaignId, { $inc: { failedRecipients: 1 } }).exec();
        await this.checkCampaignCompletion(campaignId);
        await releaseLock();
        return;
      }

      // 4. Rate Limiting Check & Provider Rotation
      let selectedProvider: EmailProviderDocument | null = await this.providerModel.findOne({
        _id: campaign.emailProviderId,
        organizationId: new Types.ObjectId(orgId),
        isDeleted: { $ne: true },
      }).exec();

      let hasBudget = selectedProvider && selectedProvider.status === ProviderStatus.ACTIVE && 
                       await this.checkAndIncrementProviderRate(client, selectedProvider);

      // If default campaign provider is exhausted, search alternative active providers (rotation check)
      if (!hasBudget) {
        this.logger.warn(`Default provider ${campaign.emailProviderId} rate limits hit or inactive. Initiating failover rotation.`);
        const activeProviders = await this.providerModel.find({
          organizationId: new Types.ObjectId(orgId),
          status: ProviderStatus.ACTIVE,
          isDeleted: { $ne: true },
        }).sort({ priority: 1 }).exec();

        selectedProvider = null;
        for (const prov of activeProviders) {
          const allowed = await this.checkAndIncrementProviderRate(client, prov);
          if (allowed) {
            selectedProvider = prov;
            break;
          }
        }
      }

      if (!selectedProvider) {
        // Release lock before throwing error to allow BullMQ retries
        await releaseLock();
        // Throttle: Re-queue job by throwing error (which triggers BullMQ retry backoff)
        throw new Error(`Sending rate limits exceeded for all active email providers in organization ${orgId}. Backing off...`);
      }

      // Load Sender Identity
      const sender = await this.recipientModel.db.model(SenderIdentity.name).findOne({
        _id: campaign.senderIdentityId,
        organizationId: new Types.ObjectId(orgId),
        isDeleted: { $ne: true },
      }).exec();

      if (!sender) {
        this.logger.error(`Sender identity ${campaign.senderIdentityId} not found.`);
        await this.recipientModel.findByIdAndUpdate(recipientId, {
          status: 'failed',
          error: 'Sender identity not found.',
        }).exec();
        await this.campaignModel.findByIdAndUpdate(campaignId, { $inc: { failedRecipients: 1 } }).exec();
        await this.checkCampaignCompletion(campaignId);
        await releaseLock();
        return;
      }

      try {
        // 5. Fetch Contact Details to compile variables
        const contact = await this.contactModel.findById(contactId).exec();
        if (!contact) {
          throw new Error(`Contact ID ${contactId} not found in CRM database.`);
        }

        // 6. Retrieve template & render placeholders
        const template = await this.templatesService.getTemplate(orgId, campaign.emailTemplateId.toString());
        const compiledSubject = this.templatesService.compile(campaign.subject, contact);
        let compiledHtml = this.templatesService.compile(template.htmlContent, contact);

        // 7. Rewrite Links & Open Pixel Tracking
        const trackingBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

        compiledHtml = compiledHtml.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi, (match, originalUrl, rest) => {
          if (!originalUrl || originalUrl.startsWith('#') || originalUrl.startsWith('mailto:') || originalUrl.startsWith('tel:')) {
            return match;
          }
          const trackingUrl = `${trackingBaseUrl}/tracking/click?campaignId=${campaignId}&recipientId=${recipientId}&url=${encodeURIComponent(originalUrl)}`;
          return `<a href="${trackingUrl}"${rest}>`;
        });

        const trackingUrl = `${trackingBaseUrl}/tracking/open?campaignId=${campaignId}&recipientId=${recipientId}`;
        const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none; width:1px; height:1px; border:0;" alt="" />`;
        const hiddenDiv = `<div style="color: white; font-size: 1px; display:none; line-height: 1px; max-height: 0; overflow: hidden;">${recipientId}</div>`;
        const trackingLink = `<a href="${trackingUrl}" style="display:none; text-decoration:none; color:transparent;">&nbsp;</a>`;

        const trackingPayload = `\n${trackingPixel}\n${hiddenDiv}\n${trackingLink}\n`;
        if (compiledHtml.includes('</body>')) {
          compiledHtml = compiledHtml.replace('</body>', `${trackingPayload}</body>`);
        } else {
          compiledHtml += trackingPayload;
        }

        // 8. Dispatch Email
        await this.dispatchMail(selectedProvider, sender, email, compiledSubject, compiledHtml, campaignId, recipientId);

        // 9. Update stats as success
        await this.recipientModel.findByIdAndUpdate(recipientId, {
          status: 'sent',
          sentAt: new Date(),
        }).exec();

        await this.campaignModel.findByIdAndUpdate(campaignId, { $inc: { sentRecipients: 1 } }).exec();

      } catch (err: any) {
        this.logger.error(`Failed to dispatch email to ${email}: ${err.message}`);
        await this.recipientModel.findByIdAndUpdate(recipientId, {
          status: 'failed',
          error: err.message || 'Unknown send error',
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

  private async checkAndIncrementProviderRate(client: any, provider: any): Promise<boolean> {
    const providerId = provider._id.toString();
    const minKey = `rate:provider:${providerId}:min`;
    const hourKey = `rate:provider:${providerId}:hour`;
    const dayKey = `rate:provider:${providerId}:day`;

    if (provider.rateLimitPerMin > 0) {
      const minCount = await client.get(minKey);
      if (Number(minCount || 0) >= provider.rateLimitPerMin) return false;
    }
    if (provider.hourlyLimit > 0) {
      const hourCount = await client.get(hourKey);
      if (Number(hourCount || 0) >= provider.hourlyLimit) return false;
    }
    if (provider.dailyLimit > 0) {
      const dayCount = await client.get(dayKey);
      if (Number(dayCount || 0) >= provider.dailyLimit) return false;
    }

    // Increment and apply TTL atomicity fallback
    const newMin = await client.incr(minKey);
    if (newMin === 1) await client.expire(minKey, 60);

    const newHour = await client.incr(hourKey);
    if (newHour === 1) await client.expire(hourKey, 3600);

    const newDay = await client.incr(dayKey);
    if (newDay === 1) await client.expire(dayKey, 86400);

    return true;
  }

  private async dispatchMail(
    provider: any,
    sender: any,
    to: string,
    subject: string,
    html: string,
    campaignId: string,
    recipientId: string,
  ): Promise<void> {
    const credentials = this.emailProvidersService.getDecryptedCredentials(provider);

    // If sandbox / local testing credentials, mock dispatch
    if (credentials.apiKey === 'mock_test_key' || credentials.pass === 'mock_test_pass') {
      this.logger.log(`[MOCK CAMPAIGN EMAIL SEND] Engine: ${provider.type} | From: "${sender.name}" <${sender.email}> | To: ${to} | Subject: ${subject}`);
      return;
    }

    switch (provider.type) {
      case ProviderType.SMTP:
      case ProviderType.GMAIL:
      case ProviderType.OUTLOOK: {
        const transporter = nodemailer.createTransport({
          host: credentials.host,
          port: Number(credentials.port),
          secure: credentials.secure === true || credentials.secure === 'true',
          auth: {
            user: credentials.auth?.user || credentials.user,
            pass: credentials.auth?.pass || credentials.pass,
          },
        });
        await transporter.sendMail({
          from: `"${sender.name}" <${sender.email}>`,
          to,
          subject,
          html,
          headers: {
            'X-Campaign-Id': campaignId,
            'X-Recipient-Id': recipientId,
          },
        });
        break;
      }

      case ProviderType.SENDGRID: {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${credentials.apiKey}`,
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: sender.email, name: sender.name },
            subject,
            content: [{ type: 'text/html', value: html }],
            custom_args: { campaignId, recipientId },
          }),
        });
        if (res.status >= 400) {
          const text = await res.text();
          throw new BadRequestException(`SendGrid Dispatch Error: ${text}`);
        }
        break;
      }

      case ProviderType.RESEND: {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${credentials.apiKey}`,
          },
          body: JSON.stringify({
            from: `"${sender.name}" <${sender.email}>`,
            to,
            subject,
            html,
            headers: {
              'X-Campaign-Id': campaignId,
              'X-Recipient-Id': recipientId,
            },
          }),
        });
        if (res.status >= 400) {
          const text = await res.text();
          throw new BadRequestException(`Resend Dispatch Error: ${text}`);
        }
        break;
      }

      case ProviderType.MAILGUN: {
        const domain = credentials.domain || 'sandbox';
        const mgHost = credentials.host || 'api.mailgun.net';
        const auth = Buffer.from(`api:${credentials.apiKey}`).toString('base64');
        const form = new URLSearchParams();
        form.append('from', `"${sender.name}" <${sender.email}>`);
        form.append('to', to);
        form.append('subject', subject);
        form.append('html', html);
        form.append('v:campaignId', campaignId);
        form.append('v:recipientId', recipientId);

        const res = await fetch(`https://${mgHost}/v3/${domain}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });
        if (res.status >= 400) {
          const text = await res.text();
          throw new BadRequestException(`Mailgun Dispatch Error: ${text}`);
        }
        break;
      }

      case ProviderType.SES: {
        this.logger.log(`[SES Dispatch Bypass] SES requires AWS-SDK config. Mapped Subject: ${subject}`);
        break;
      }

      default:
        throw new BadRequestException(`Dispatch not supported for provider engine type ${provider.type}`);
    }
  }

  private async checkCampaignCompletion(campaignId: string) {
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (!campaign) return;

    const pendingCount = await this.recipientModel.countDocuments({
      campaignId: campaign._id,
      status: 'pending',
    }).exec();

    if (pendingCount === 0) {
      campaign.status = 'completed';
      campaign.completedAt = new Date();
      await campaign.save();
      this.logger.log(`Campaign ${campaignId} sending completed. Total: ${campaign.totalRecipients}.`);
    }
  }
}
