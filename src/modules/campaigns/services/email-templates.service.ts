import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { BaseTenantRepository } from '../../../common/repositories/base-tenant.repository';
import { EmailTemplate, EmailTemplateDocument } from '../schemas/email-template.schema';
import { CreateEmailTemplateDto } from '../dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from '../dto/update-email-template.dto';
import { SendTestEmailDto } from '../dto/send-test-email.dto';
import { EmailProvidersService } from './email-providers.service';
import { SenderIdentitiesService } from './sender-identities.service';
import { ProviderType } from '../schemas/email-provider.schema';

@Injectable()
export class EmailTemplatesService extends BaseTenantRepository<EmailTemplateDocument> {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    @InjectModel(EmailTemplate.name)
    private readonly templateModel: Model<EmailTemplateDocument>,
    private readonly emailProvidersService: EmailProvidersService,
    private readonly senderIdentitiesService: SenderIdentitiesService,
  ) {
    super(templateModel);
  }

  extractVariables(html: string, subject: string): string[] {
    const regex = /\{\{([a-zA-Z0-9_\.]+)\}\}/g;
    const vars = new Set<string>();
    let match;

    // Reset regex index before scanning
    regex.lastIndex = 0;
    while ((match = regex.exec(html)) !== null) {
      vars.add(match[1]);
    }

    regex.lastIndex = 0;
    while ((match = regex.exec(subject)) !== null) {
      vars.add(match[1]);
    }

    return Array.from(vars);
  }

  compile(content: string, contact: Record<string, any>): string {
    if (!content) return '';
    return content.replace(/\{\{([a-zA-Z0-9_\.]+)\}\}/g, (match, path) => {
      const parts = path.split('.');
      let val: any = contact;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (val === null || val === undefined) break;

        // Custom Fields mapping resolution
        if (part === 'customFields') {
          const nextPart = parts[i + 1];
          if (!nextPart) {
            val = undefined;
            break;
          }
          if (val.customFields instanceof Map) {
            val = val.customFields.get(nextPart);
          } else if (val.customFields && typeof val.customFields === 'object') {
            val = val.customFields[nextPart];
          } else {
            val = undefined;
          }
          break;
        }

        val = val[part];
      }

      return val !== undefined ? String(val) : '';
    });
  }

  async createTemplate(orgId: string, userId: string, dto: CreateEmailTemplateDto): Promise<EmailTemplateDocument> {
    const variables = this.extractVariables(dto.htmlContent, dto.subject);
    const templateData = {
      ...dto,
      variables,
      organizationId: new Types.ObjectId(orgId),
      createdById: userId ? new Types.ObjectId(userId) : undefined,
    };

    return this.create(orgId, templateData as any);
  }

  async getTemplates(orgId: string): Promise<EmailTemplateDocument[]> {
    return this.templateModel
      .find({ organizationId: new Types.ObjectId(orgId), isDeleted: { $ne: true } })
      .exec();
  }

  async getTemplate(orgId: string, id: string): Promise<EmailTemplateDocument> {
    const template = await this.templateModel
      .findOne(this.getScopedFilter(orgId, { _id: id, isDeleted: { $ne: true } } as any))
      .exec();

    if (!template) {
      throw new NotFoundException(`Email template with ID ${id} not found`);
    }

    return template;
  }

  async updateTemplate(orgId: string, id: string, dto: UpdateEmailTemplateDto): Promise<EmailTemplateDocument> {
    const template = await this.templateModel.findOne(
      this.getScopedFilter(orgId, { _id: id, isDeleted: { $ne: true } } as any)
    ).exec();

    if (!template) {
      throw new NotFoundException(`Email template with ID ${id} not found`);
    }

    const htmlContent = dto.htmlContent !== undefined ? dto.htmlContent : template.htmlContent;
    const subject = dto.subject !== undefined ? dto.subject : template.subject;
    const variables = this.extractVariables(htmlContent, subject);

    const updated = await this.templateModel.findOneAndUpdate(
      this.getScopedFilter(orgId, { _id: id, isDeleted: { $ne: true } } as any),
      { ...dto, variables },
      { new: true }
    ).exec();

    if (!updated) {
      throw new NotFoundException(`Email template with ID ${id} not found`);
    }

    return updated;
  }

  async deleteTemplate(orgId: string, id: string): Promise<void> {
    const result = await this.templateModel.updateOne(
      this.getScopedFilter(orgId, { _id: id, isDeleted: { $ne: true } } as any),
      { isDeleted: true }
    ).exec();

    if (result.modifiedCount === 0) {
      throw new NotFoundException(`Email template with ID ${id} not found`);
    }
  }

  async sendTestEmail(orgId: string, templateId: string, dto: SendTestEmailDto): Promise<void> {
    const template = await this.getTemplate(orgId, templateId);

    // 1. Fetch provider details
    const provider = await this.emailProvidersService.findOne(orgId, {
      _id: new Types.ObjectId(dto.emailProviderId),
      isDeleted: { $ne: true },
    } as any);

    if (!provider) {
      throw new NotFoundException(`Email provider with ID ${dto.emailProviderId} not found`);
    }

    // 2. Fetch sender profile headers
    const sender = await this.senderIdentitiesService.findOne(orgId, {
      _id: new Types.ObjectId(dto.senderIdentityId),
      isDeleted: { $ne: true },
    } as any);

    if (!sender) {
      throw new NotFoundException(`Sender identity with ID ${dto.senderIdentityId} not found`);
    }

    // 3. Setup mock variable payload for testing rendering output
    const mockVariables = {
      firstName: 'John',
      lastName: 'Doe',
      email: dto.recipientEmail,
      mobile: '+19723455615',
      company: 'ProvenPeak Solutions',
      jobTitle: 'CRM Executive',
      department: 'Marketing',
      industry: 'Technology',
      city: 'Dallas',
      state: 'Texas',
      country: 'United States',
      zipCode: '75201',
      customFields: {
        age: 30,
        membership: 'Premium',
        registrationDate: '2026-06-19',
      },
    };

    const compiledSubject = this.compile(template.subject, mockVariables);
    const compiledHtml = this.compile(template.htmlContent, mockVariables);

    // 4. Dispatch Email directly (bypassing BullMQ)
    await this.sendMailDirect(provider, sender, dto.recipientEmail, compiledSubject, compiledHtml);
  }

  private async sendMailDirect(
    provider: any,
    sender: any,
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const credentials = this.emailProvidersService.getDecryptedCredentials(provider);

    // If sandbox / local testing credentials, mock dispatch
    if (credentials.apiKey === 'mock_test_key' || credentials.pass === 'mock_test_pass') {
      this.logger.log(`[MOCK EMAIL SEND] Engine: ${provider.type} | From: "${sender.name}" <${sender.email}> | To: ${to} | Subject: ${subject}`);
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
        this.logger.log(`[SES Send Bypass] Direct dispatch for SES requires aws-sdk. Mapped Subject: ${subject}`);
        break;
      }

      default:
        throw new BadRequestException(`Direct email dispatch not supported for provider engine type ${provider.type}`);
    }
  }
}
