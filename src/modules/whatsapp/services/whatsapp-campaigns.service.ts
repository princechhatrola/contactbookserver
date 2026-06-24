import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseTenantRepository } from '../../../common/repositories/base-tenant.repository';
import { WhatsappCampaign, WhatsappCampaignDocument } from '../schemas/whatsapp-campaign.schema';
import { WhatsappCampaignRecipient, WhatsappCampaignRecipientDocument } from '../schemas/whatsapp-campaign-recipient.schema';
import { CreateWhatsappCampaignDto } from '../dto/create-whatsapp-campaign.dto';
import { UpdateWhatsappCampaignDto } from '../dto/update-whatsapp-campaign.dto';
import { WhatsappAudienceCompilerService } from './whatsapp-audience-compiler.service';
import { AuditLogEmitter } from '../../audit-logs/audit-log-emitter';

@Injectable()
export class WhatsappCampaignsService extends BaseTenantRepository<WhatsappCampaignDocument> {
  private readonly logger = new Logger(WhatsappCampaignsService.name);

  constructor(
    @InjectModel(WhatsappCampaign.name)
    private readonly campaignModel: Model<WhatsappCampaignDocument>,
    @InjectModel(WhatsappCampaignRecipient.name)
    private readonly recipientModel: Model<WhatsappCampaignRecipientDocument>,
    private readonly audienceCompilerService: WhatsappAudienceCompilerService,
    private readonly auditLogEmitter: AuditLogEmitter,
  ) {
    super(campaignModel);
  }

  async createCampaign(orgId: string, userId: string, dto: CreateWhatsappCampaignDto): Promise<WhatsappCampaignDocument> {
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
      action: 'whatsapp_campaign.created',
      description: `WhatsApp Campaign "${campaign.name}" created as draft.`,
      metadata: { campaignId: campaign._id },
    });

    return campaign;
  }

  async getCampaigns(
    orgId: string,
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<{ data: WhatsappCampaignDocument[]; total: number; page: number; limit: number; pages: number }> {
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { isDeleted: { $ne: true } };
    if (search) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    const scopedFilter = this.getScopedFilter(orgId, filter);

    const [data, total] = await Promise.all([
      this.campaignModel
        .find(scopedFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('whatsappProviderId', 'name phoneNumber')
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

  async getCampaign(orgId: string, id: string): Promise<WhatsappCampaignDocument> {
    const campaign = await this.campaignModel
      .findOne(this.getScopedFilter(orgId, { _id: id, isDeleted: { $ne: true } } as any))
      .populate('whatsappProviderId')
      .populate('createdById', 'firstName lastName email')
      .exec();

    if (!campaign) {
      throw new NotFoundException(`WhatsApp Campaign with ID ${id} not found`);
    }

    return campaign;
  }

  async updateCampaign(orgId: string, id: string, dto: UpdateWhatsappCampaignDto): Promise<WhatsappCampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new BadRequestException(`Cannot update campaign in "${campaign.status}" status.`);
    }

    const updated = await this.update(orgId, id, dto);
    if (!updated) {
      throw new NotFoundException(`WhatsApp Campaign with ID ${id} not found`);
    }

    return updated;
  }

  async deleteCampaign(orgId: string, id: string): Promise<void> {
    const result = await this.campaignModel.updateOne(
      this.getScopedFilter(orgId, { _id: id, isDeleted: { $ne: true } } as any),
      { isDeleted: true }
    ).exec();

    if (result.modifiedCount === 0) {
      throw new NotFoundException(`WhatsApp Campaign with ID ${id} not found`);
    }
  }

  async duplicateCampaign(orgId: string, id: string): Promise<WhatsappCampaignDocument> {
    const original = await this.getCampaign(orgId, id);

    const duplicated = new this.campaignModel({
      organizationId: original.organizationId,
      name: `${original.name} (Copy)`,
      messageBody: original.messageBody,
      whatsappProviderId: original.whatsappProviderId,
      autoRotate: original.autoRotate,
      segmentFilters: original.segmentFilters,
      status: 'draft',
      totalRecipients: 0,
      sentRecipients: 0,
      failedRecipients: 0,
      isDeleted: false,
    });

    return duplicated.save();
  }

  async scheduleCampaign(orgId: string, id: string, scheduledAtStr?: string): Promise<WhatsappCampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new BadRequestException(`Cannot schedule campaign in "${campaign.status}" status.`);
    }

    // Compile segment targets count
    const preview = await this.audienceCompilerService.getSegmentPreview(orgId, campaign.segmentFilters);

    const scheduledAt = scheduledAtStr ? new Date(scheduledAtStr) : new Date();
    campaign.status = 'scheduled';
    campaign.scheduledAt = scheduledAt;
    campaign.totalRecipients = preview.cleanCount;
    await campaign.save();

    this.logger.log(`WhatsApp Campaign ${id} scheduled for ${scheduledAt.toISOString()} with ${preview.cleanCount} recipients.`);

    return campaign;
  }

  async pauseCampaign(orgId: string, id: string): Promise<WhatsappCampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status !== 'scheduled' && campaign.status !== 'sending') {
      throw new BadRequestException(`Cannot pause campaign in "${campaign.status}" status.`);
    }

    campaign.status = 'paused';
    await campaign.save();

    this.logger.log(`WhatsApp Campaign ${id} paused.`);
    return campaign;
  }

  async resumeCampaign(orgId: string, id: string): Promise<WhatsappCampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status !== 'paused') {
      throw new BadRequestException(`Cannot resume campaign in "${campaign.status}" status.`);
    }

    const now = new Date();
    if (campaign.scheduledAt && campaign.scheduledAt <= now) {
      campaign.scheduledAt = now;
    }

    campaign.status = 'scheduled';
    await campaign.save();

    this.logger.log(`WhatsApp Campaign ${id} resumed.`);
    return campaign;
  }

  async cancelCampaign(orgId: string, id: string): Promise<WhatsappCampaignDocument> {
    const campaign = await this.getCampaign(orgId, id);

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new BadRequestException(`Cannot cancel campaign in "${campaign.status}" status.`);
    }

    campaign.status = 'cancelled';
    await campaign.save();

    this.logger.log(`WhatsApp Campaign ${id} cancelled.`);
    return campaign;
  }

  async getCampaignRecipients(
    orgId: string,
    campaignId: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: WhatsappCampaignRecipientDocument[]; total: number; page: number; limit: number; pages: number }> {
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      organizationId: new Types.ObjectId(orgId),
      whatsappCampaignId: new Types.ObjectId(campaignId),
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
}
