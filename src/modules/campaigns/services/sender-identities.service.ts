import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseTenantRepository } from '../../../common/repositories/base-tenant.repository';
import { SenderIdentity, SenderIdentityDocument } from '../schemas/sender-identity.schema';
import { EmailProvider, EmailProviderDocument } from '../schemas/email-provider.schema';
import { CreateSenderIdentityDto } from '../dto/create-sender-identity.dto';

@Injectable()
export class SenderIdentitiesService extends BaseTenantRepository<SenderIdentityDocument> {
  constructor(
    @InjectModel(SenderIdentity.name)
    private readonly senderIdentityModel: Model<SenderIdentityDocument>,
    @InjectModel(EmailProvider.name)
    private readonly emailProviderModel: Model<EmailProviderDocument>,
  ) {
    super(senderIdentityModel);
  }

  async createSender(orgId: string, dto: CreateSenderIdentityDto): Promise<SenderIdentityDocument> {
    // 1. Verify mapped email provider exists and belongs to the organization
    const provider = await this.emailProviderModel.findOne({
      _id: new Types.ObjectId(dto.emailProviderId),
      organizationId: new Types.ObjectId(orgId),
      isDeleted: { $ne: true },
    }).exec();

    if (!provider) {
      throw new NotFoundException(`Email provider with ID ${dto.emailProviderId} not found`);
    }

    // 2. If marked as default, clear default flag from other senders in organization
    if (dto.isDefault) {
      await this.senderIdentityModel.updateMany(
        { organizationId: new Types.ObjectId(orgId) },
        { isDefault: false }
      ).exec();
    }

    const senderData = {
      ...dto,
      organizationId: new Types.ObjectId(orgId),
      emailProviderId: new Types.ObjectId(dto.emailProviderId),
      isVerified: true, // Default to true or let user verify it. For SMTP/API, we auto-verify for CRM convenience.
      reputationScore: 100,
    };

    return this.create(orgId, senderData as any);
  }

  async getSenders(orgId: string): Promise<SenderIdentityDocument[]> {
    return this.senderIdentityModel
      .find({ organizationId: new Types.ObjectId(orgId), isDeleted: { $ne: true } })
      .populate('emailProviderId', 'name type status priority')
      .exec();
  }

  async getSender(orgId: string, senderId: string): Promise<SenderIdentityDocument> {
    const sender = await this.senderIdentityModel
      .findOne(this.getScopedFilter(orgId, { _id: senderId, isDeleted: { $ne: true } } as any))
      .populate('emailProviderId', 'name type status priority')
      .exec();

    if (!sender) {
      throw new NotFoundException(`Sender identity with ID ${senderId} not found`);
    }

    return sender;
  }

  async deleteSender(orgId: string, senderId: string): Promise<void> {
    const result = await this.senderIdentityModel.updateOne(
      this.getScopedFilter(orgId, { _id: senderId, isDeleted: { $ne: true } } as any),
      { isDeleted: true }
    ).exec();

    if (result.modifiedCount === 0) {
      throw new NotFoundException(`Sender identity with ID ${senderId} not found`);
    }
  }

  async setDefaultSender(orgId: string, senderId: string): Promise<SenderIdentityDocument> {
    const sender = await this.senderIdentityModel.findOne(
      this.getScopedFilter(orgId, { _id: senderId, isDeleted: { $ne: true } } as any)
    ).exec();

    if (!sender) {
      throw new NotFoundException(`Sender identity with ID ${senderId} not found`);
    }

    // Clear default flag on all others
    await this.senderIdentityModel.updateMany(
      { organizationId: new Types.ObjectId(orgId) },
      { isDefault: false }
    ).exec();

    // Set this one as default
    sender.isDefault = true;
    return sender.save();
  }

  async verifySender(orgId: string, senderId: string): Promise<SenderIdentityDocument> {
    const sender = await this.senderIdentityModel.findOne(
      this.getScopedFilter(orgId, { _id: senderId, isDeleted: { $ne: true } } as any)
    ).exec();

    if (!sender) {
      throw new NotFoundException(`Sender identity with ID ${senderId} not found`);
    }

    sender.isVerified = true;
    return sender.save();
  }
}
