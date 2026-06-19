import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from '../../contacts/schemas/contact.schema';
import { Lead, LeadDocument, LeadStatus } from '../../leads/schemas/lead.schema';
import { SuppressionListService } from './suppression-list.service';
import { AudienceSegmentFilterDto } from '../dto/audience-segment-filter.dto';

@Injectable()
export class AudienceCompilerService {
  private readonly logger = new Logger(AudienceCompilerService.name);

  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    private readonly suppressionService: SuppressionListService,
  ) {}

  /**
   * Builds the MongoDB query filter for contacts based on segment filters.
   */
  private async buildContactFilter(orgId: string, dto: AudienceSegmentFilterDto): Promise<any> {
    const filter: any = {
      organizationId: new Types.ObjectId(orgId),
      isDeleted: { $ne: true },
      email: { $exists: true, $ne: '', $type: 'string' },
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
   * Compiles the dynamic segment and returns contacts who are NOT suppressed.
   */
  async compileSegment(orgId: string, dto: AudienceSegmentFilterDto): Promise<ContactDocument[]> {
    const filter = await this.buildContactFilter(orgId, dto);
    
    // 1. Fetch matching contacts
    const contacts = await this.contactModel.find(filter).exec();
    if (contacts.length === 0) {
      return [];
    }

    // 2. Fetch suppressed emails
    const emails = contacts.map(c => c.email as string);
    const suppressedSet = await this.suppressionService.filterSuppressed(orgId, emails);

    // 3. Filter out suppressed contacts
    return contacts.filter(contact => {
      const email = contact.email?.trim().toLowerCase() || '';
      return !suppressedSet.has(email);
    });
  }

  /**
   * Get preview counts for the segment builder.
   */
  async getSegmentPreview(
    orgId: string,
    dto: AudienceSegmentFilterDto
  ): Promise<{ totalMatched: number; suppressedCount: number; cleanCount: number }> {
    const filter = await this.buildContactFilter(orgId, dto);

    // Get matching contacts emails
    const contacts = await this.contactModel.find(filter, { email: 1 }).exec();
    const totalMatched = contacts.length;

    if (totalMatched === 0) {
      return { totalMatched: 0, suppressedCount: 0, cleanCount: 0 };
    }

    const emails = contacts.map(c => c.email as string);
    const suppressedSet = await this.suppressionService.filterSuppressed(orgId, emails);
    const suppressedCount = suppressedSet.size;
    const cleanCount = totalMatched - suppressedCount;

    return {
      totalMatched,
      suppressedCount,
      cleanCount,
    };
  }
}
