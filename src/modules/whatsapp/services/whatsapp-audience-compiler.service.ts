import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from '../../contacts/schemas/contact.schema';
import { Lead, LeadDocument, LeadStatus } from '../../leads/schemas/lead.schema';
import { AudienceSegmentFilterDto } from '../../campaigns/dto/audience-segment-filter.dto';

@Injectable()
export class WhatsappAudienceCompilerService {
  private readonly logger = new Logger(WhatsappAudienceCompilerService.name);

  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
  ) {}

  /**
   * Builds the MongoDB query filter for contacts based on segment filters for WhatsApp.
   */
  private async buildContactFilter(orgId: string, dto: AudienceSegmentFilterDto): Promise<any> {
    const filter: any = {
      organizationId: new Types.ObjectId(orgId),
      isDeleted: { $ne: true },
      mobile: { $exists: true, $ne: '', $type: 'string' }, // Require mobile phone number for WhatsApp
    };

    // Filter by groups
    if (dto.groupIds && dto.groupIds.length > 0) {
      filter.groups = { $in: dto.groupIds.map(id => new Types.ObjectId(id)) };
    }

    // Filter by tags
    if (dto.tags && dto.tags.length > 0) {
      filter.tags = { $in: dto.tags };
    }

    // Filter by lead status
    if (dto.leadStatuses && dto.leadStatuses.length > 0) {
      const leads = await this.leadModel.find({
        organizationId: new Types.ObjectId(orgId),
        status: { $in: dto.leadStatuses as LeadStatus[] },
      }, { contactId: 1 }).exec();

      const contactIds = leads.map(lead => lead.contactId);
      filter._id = { $in: contactIds };
    }

    // Filter by custom fields
    if (dto.customFields) {
      for (const [key, value] of Object.entries(dto.customFields)) {
        if (value !== undefined && value !== null && value !== '') {
          filter[`customFields.${key}`] = value;
        }
      }
    }

    return filter;
  }

  /**
   * Compiles the dynamic segment and returns contacts who have valid mobile numbers.
   */
  async compileSegment(orgId: string, dto: AudienceSegmentFilterDto): Promise<ContactDocument[]> {
    const filter = await this.buildContactFilter(orgId, dto);
    return this.contactModel.find(filter).exec();
  }

  /**
   * Get preview counts for the segment builder.
   */
  async getSegmentPreview(
    orgId: string,
    dto: AudienceSegmentFilterDto
  ): Promise<{ totalMatched: number; cleanCount: number }> {
    const filter = await this.buildContactFilter(orgId, dto);

    const count = await this.contactModel.countDocuments(filter).exec();

    return {
      totalMatched: count,
      cleanCount: count,
    };
  }
}
