import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, QueryFilter } from 'mongoose';
import * as fs from 'fs';
import { BaseTenantRepository } from '../../../common/repositories/base-tenant.repository';
import { Campaign, CampaignDocument } from '../schemas/campaign.schema';
import { CampaignRecipient, CampaignRecipientDocument } from '../schemas/campaign-recipient.schema';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import { AudienceCompilerService } from './audience-compiler.service';
import { AuditLogEmitter } from '../../audit-logs/audit-log-emitter';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class CampaignsService extends BaseTenantRepository<CampaignDocument> {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(CampaignRecipient.name)
    private readonly recipientModel: Model<CampaignRecipientDocument>,
    private readonly audienceCompilerService: AudienceCompilerService,
    private readonly auditLogEmitter: AuditLogEmitter,
    private readonly storageService: StorageService,
  ) {
    super(campaignModel);
  }

  async createCampaign(orgId: string, userId: string, dto: CreateCampaignDto): Promise<CampaignDocument> {
    const campaign = await this.create(orgId, {
      ...dto,
      status: 'draft',
      totalRecipients: 0,
      sentRecipients: 0,
      failedRecipients: 0,
      createdById: new Types.ObjectId(userId),
    } as any);

    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'campaign.created',
      description: `Campaign "${campaign.name}" created as draft.`,
      metadata: { campaignId: campaign._id },
    });

    return campaign;
  }

  async getCampaigns(
    orgId: string,
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<{ data: CampaignDocument[]; total: number; page: number; limit: number; pages: number }> {
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { isDeleted: { $ne: true } };
    if (search) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { subject: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const scopedFilter = this.getScopedFilter(orgId, filter);

    const [data, total] = await Promise.all([
      this.campaignModel
        .find(scopedFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('emailTemplateId', 'name')
        .populate('emailProviderId', 'name type')
        .populate('senderIdentityId', 'name email')
        .populate('createdById', 'firstName lastName email')
        .exec(),
      this.campaignModel.countDocuments(scopedFilter).exec(),
    ]);

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    };
  }

  async getCampaign(orgId: string, id: string): Promise<CampaignDocument> {
    const campaign = await this.campaignModel
      .findOne(this.getScopedFilter(orgId, { _id: id, isDeleted: { $ne: true } } as any))
      .populate('emailTemplateId')
      .populate('emailProviderId')
      .populate('senderIdentityId')
      .populate('createdById', 'firstName lastName email')
      .exec();

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    return campaign;
  }

  async updateCampaign(orgId: string, id: string, dto: UpdateCampaignDto): Promise<CampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new BadRequestException(`Cannot update campaign in "${campaign.status}" status.`);
    }

    const updated = await this.update(orgId, id, dto);
    if (!updated) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }

    return updated;
  }

  async deleteCampaign(orgId: string, id: string): Promise<void> {
    const result = await this.campaignModel.updateOne(
      this.getScopedFilter(orgId, { _id: id, isDeleted: { $ne: true } } as any),
      { isDeleted: true }
    ).exec();

    if (result.modifiedCount === 0) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }
  }

  async duplicateCampaign(orgId: string, id: string): Promise<CampaignDocument> {
    const original = await this.getCampaign(orgId, id);

    const duplicated = new this.campaignModel({
      organizationId: original.organizationId,
      name: `${original.name} (Copy)`,
      subject: original.subject,
      emailTemplateId: original.emailTemplateId,
      emailProviderId: original.emailProviderId,
      senderIdentityId: original.senderIdentityId,
      segmentFilters: original.segmentFilters,
      status: 'draft',
      totalRecipients: 0,
      sentRecipients: 0,
      failedRecipients: 0,
      isDeleted: false,
    });

    return duplicated.save();
  }

  async scheduleCampaign(orgId: string, id: string, scheduledAtStr?: string): Promise<CampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new BadRequestException(`Cannot schedule campaign in "${campaign.status}" status.`);
    }

    // 1. Calculate matching recipient counts
    const preview = await this.audienceCompilerService.getSegmentPreview(orgId, campaign.segmentFilters);

    // 2. Set scheduled properties
    const scheduledAt = scheduledAtStr ? new Date(scheduledAtStr) : new Date();
    campaign.status = 'scheduled';
    campaign.scheduledAt = scheduledAt;
    campaign.totalRecipients = preview.cleanCount;
    await campaign.save();

    this.logger.log(`Campaign ${id} scheduled for ${scheduledAt.toISOString()} with ${preview.cleanCount} recipients.`);

    return campaign;
  }

  async pauseCampaign(orgId: string, id: string): Promise<CampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status !== 'scheduled' && campaign.status !== 'sending') {
      throw new BadRequestException(`Cannot pause campaign in "${campaign.status}" status.`);
    }

    campaign.status = 'paused';
    await campaign.save();

    this.logger.log(`Campaign ${id} paused.`);
    return campaign;
  }

  async resumeCampaign(orgId: string, id: string): Promise<CampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status !== 'paused') {
      throw new BadRequestException(`Cannot resume campaign in "${campaign.status}" status.`);
    }

    // Check if scheduled date has already passed. If so, trigger dispatch immediately.
    const now = new Date();
    if (campaign.scheduledAt && campaign.scheduledAt <= now) {
      campaign.scheduledAt = now;
    }

    campaign.status = 'scheduled';
    await campaign.save();

    this.logger.log(`Campaign ${id} resumed to scheduled.`);
    return campaign;
  }

  async cancelCampaign(orgId: string, id: string): Promise<CampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new BadRequestException(`Cannot cancel campaign in "${campaign.status}" status.`);
    }

    campaign.status = 'cancelled';
    await campaign.save();

    this.logger.log(`Campaign ${id} cancelled.`);
    return campaign;
  }

  async getCampaignRecipients(
    orgId: string,
    campaignId: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: CampaignRecipientDocument[]; total: number; page: number; limit: number; pages: number }> {
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      organizationId: new Types.ObjectId(orgId),
      campaignId: new Types.ObjectId(campaignId),
    };

    const [data, total] = await Promise.all([
      this.recipientModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('contactId', 'firstName lastName')
        .exec(),
      this.recipientModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    };
  }

  async addAttachment(
    orgId: string,
    campaignId: string,
    file: Express.Multer.File,
  ): Promise<CampaignDocument> {
    const campaign = await this.getCampaign(orgId, campaignId);

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new BadRequestException(`Cannot add attachments to campaign in "${campaign.status}" status.`);
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Attachment size exceeds the maximum limit of 5MB.');
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitizedFilename = file.originalname.replace(/\s+/g, '_');
    const s3Key = `campaigns/${campaignId}/attachments/${uniqueSuffix}-${sanitizedFilename}`;

    try {
      await this.storageService.uploadFile(file.path, s3Key);

      const updated = await this.campaignModel.findByIdAndUpdate(
        campaignId,
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
        throw new NotFoundException(`Campaign with ID ${campaignId} not found`);
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
    campaignId: string,
    filename: string,
  ): Promise<CampaignDocument> {
    const campaign = await this.getCampaign(orgId, campaignId);

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new BadRequestException(`Cannot remove attachments from campaign in "${campaign.status}" status.`);
    }

    const attachment = campaign.attachments?.find((att) => att.filename === filename);
    if (!attachment) {
      throw new NotFoundException(`Attachment "${filename}" not found in this campaign.`);
    }

    try {
      await this.storageService.deleteFile(attachment.path);

      const updated = await this.campaignModel.findByIdAndUpdate(
        campaignId,
        {
          $pull: {
            attachments: { filename },
          },
        },
        { new: true },
      ).exec();

      if (!updated) {
        throw new NotFoundException(`Campaign with ID ${campaignId} not found`);
      }

      return updated;
    } catch (err: any) {
      throw new BadRequestException(`Failed to remove attachment: ${err.message}`);
    }
  }
}
