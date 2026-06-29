import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import { BaseTenantRepository } from '../../../common/repositories/base-tenant.repository';
import { WhatsappTemplate, WhatsappTemplateDocument } from '../schemas/whatsapp-template.schema';
import { CreateWhatsappTemplateDto } from '../dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from '../dto/update-whatsapp-template.dto';
import { SendTestWhatsappDto } from '../dto/send-test-whatsapp.dto';
import { StorageService } from '../../storage/storage.service';
import { WhatsappSessionManager } from './whatsapp-session-manager.service';

@Injectable()
export class WhatsappTemplatesService extends BaseTenantRepository<WhatsappTemplateDocument> {
  private readonly logger = new Logger(WhatsappTemplatesService.name);

  constructor(
    @InjectModel(WhatsappTemplate.name)
    private readonly templateModel: Model<WhatsappTemplateDocument>,
    private readonly storageService: StorageService,
    private readonly sessionManager: WhatsappSessionManager,
  ) {
    super(templateModel);
  }

  extractVariables(body: string): string[] {
    const regex = /\{\{([a-zA-Z0-9_\.]+)\}\}/g;
    const vars = new Set<string>();
    let match;

    regex.lastIndex = 0;
    while ((match = regex.exec(body)) !== null) {
      vars.add(match[1]);
    }

    return Array.from(vars);
  }

  async createTemplate(orgId: string, userId: string, dto: CreateWhatsappTemplateDto): Promise<WhatsappTemplateDocument> {
    const variables = this.extractVariables(dto.body);
    const templateData = {
      ...dto,
      variables,
      organizationId: new Types.ObjectId(orgId),
      createdById: userId ? new Types.ObjectId(userId) : undefined,
    };

    return this.create(orgId, templateData as any);
  }

  async getTemplates(orgId: string): Promise<WhatsappTemplateDocument[]> {
    return this.templateModel
      .find({ organizationId: new Types.ObjectId(orgId), isDeleted: { $ne: true } })
      .exec();
  }

  async getTemplate(orgId: string, id: string): Promise<WhatsappTemplateDocument> {
    const template = await this.templateModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(orgId), isDeleted: { $ne: true } })
      .exec();

    if (!template) {
      throw new NotFoundException(`WhatsApp Template with ID ${id} not found`);
    }

    return template;
  }

  async updateTemplate(orgId: string, id: string, dto: UpdateWhatsappTemplateDto): Promise<WhatsappTemplateDocument> {
    await this.getTemplate(orgId, id);

    const variables = dto.body ? this.extractVariables(dto.body) : undefined;
    const updateData = {
      ...dto,
      ...(variables ? { variables } : {}),
    };

    const updated = await this.update(orgId, id, updateData);
    if (!updated) {
      throw new NotFoundException(`WhatsApp Template with ID ${id} not found`);
    }

    return updated;
  }

  async deleteTemplate(orgId: string, id: string): Promise<void> {
    const result = await this.templateModel.updateOne(
      { _id: id, organizationId: new Types.ObjectId(orgId), isDeleted: { $ne: true } },
      { isDeleted: true }
    ).exec();

    if (result.modifiedCount === 0) {
      throw new NotFoundException(`WhatsApp Template with ID ${id} not found`);
    }
  }

  async addAttachment(
    orgId: string,
    templateId: string,
    file: Express.Multer.File,
  ): Promise<WhatsappTemplateDocument> {
    const template = await this.getTemplate(orgId, templateId);

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Attachment size exceeds the maximum limit of 5MB.');
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitizedFilename = file.originalname.replace(/\s+/g, '_');
    const s3Key = `whatsapp-templates/${templateId}/attachments/${uniqueSuffix}-${sanitizedFilename}`;

    try {
      await this.storageService.uploadFile(file.path, s3Key);

      const updated = await this.templateModel.findByIdAndUpdate(
        templateId,
        {
          $push: {
            attachments: {
              filename: file.originalname,
              path: s3Key,
              mimetype: file.mimetype,
              size: file.size,
            },
          },
        },
        { new: true },
      ).exec();

      if (!updated) {
        throw new NotFoundException(`WhatsApp Template with ID ${templateId} not found`);
      }

      return updated;
    } catch (err: any) {
      throw new BadRequestException(`Failed to upload attachment: ${err.message}`);
    } finally {
      if (fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (_) {}
      }
    }
  }

  async removeAttachment(
    orgId: string,
    templateId: string,
    filename: string,
  ): Promise<WhatsappTemplateDocument> {
    const template = await this.getTemplate(orgId, templateId);

    const attachment = template.attachments?.find((att) => att.filename === filename);
    if (!attachment) {
      throw new NotFoundException(`Attachment "${filename}" not found in this template.`);
    }

    try {
      await this.storageService.deleteFile(attachment.path);

      const updated = await this.templateModel.findByIdAndUpdate(
        templateId,
        {
          $pull: {
            attachments: { filename },
          },
        },
        { new: true },
      ).exec();

      if (!updated) {
        throw new NotFoundException(`WhatsApp Template with ID ${templateId} not found`);
      }

      return updated;
    } catch (err: any) {
      throw new BadRequestException(`Failed to delete attachment: ${err.message}`);
    }
  }

  async sendTestMessage(orgId: string, id: string, dto: SendTestWhatsappDto): Promise<void> {
    const template = await this.getTemplate(orgId, id);
    const socket = await this.sessionManager.getSocket(dto.whatsappProviderId);

    const cleanPhone = dto.phoneNumber.replace(/[^\d]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;

    // Compile variables with placeholders
    let compiled = template.body
      .replace(/\{\{firstName\}\}/gi, 'John')
      .replace(/\{\{lastName\}\}/gi, 'Doe')
      .replace(/\{\{phone\}\}/gi, dto.phoneNumber)
      .replace(/\{\{company\}\}/gi, 'ProvenPeak Solutions');

    // Spintax
    compiled = compiled.replace(/\{([^{}]+)\}/g, (match, choicesStr) => {
      const choices = choicesStr.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });

    await socket.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, 2000));

    if (template.attachments && template.attachments.length > 0) {
      if (compiled && compiled.trim() !== '') {
        await socket.sendMessage(jid, { text: compiled });
      }

      for (const attachment of template.attachments) {
        const stream = await this.storageService.getObjectStream(attachment.path);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);

        const mimetype = attachment.mimetype.toLowerCase();
        if (mimetype.startsWith('image/')) {
          await socket.sendMessage(jid, { image: buffer, caption: attachment.filename });
        } else if (mimetype.startsWith('video/')) {
          await socket.sendMessage(jid, { video: buffer, caption: attachment.filename });
        } else if (mimetype.startsWith('audio/')) {
          await socket.sendMessage(jid, { audio: buffer, mimetype: attachment.mimetype });
        } else {
          await socket.sendMessage(jid, {
            document: buffer,
            mimetype: attachment.mimetype,
            fileName: attachment.filename,
            caption: attachment.filename,
          });
        }
      }
    } else {
      await socket.sendMessage(jid, { text: compiled });
    }
  }
}
