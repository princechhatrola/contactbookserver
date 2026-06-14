import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, QueryFilter } from 'mongoose';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { Contact, ContactDocument } from './schemas/contact.schema';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CustomFieldsService } from './custom-fields.service';
import { TagsService } from '../tags/tags.service';
import { ActivityEmitter } from '../activities/activity-emitter';
import { AuditLogEmitter } from '../audit-logs/audit-log-emitter';

@Injectable()
export class ContactsService extends BaseTenantRepository<ContactDocument> {
  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    private readonly customFieldsService: CustomFieldsService,
    private readonly tagsService: TagsService,
    private readonly activityEmitter: ActivityEmitter,
    private readonly auditLogEmitter: AuditLogEmitter,
  ) {
    super(contactModel);
  }

  async createContact(orgId: string, userId: string, dto: CreateContactDto): Promise<ContactDocument> {
    // 1. Validate custom fields against definitions
    let validatedCustomFields = {};
    if (dto.customFields && Object.keys(dto.customFields).length > 0) {
      validatedCustomFields = await this.customFieldsService.validateCustomFields(orgId, dto.customFields);
    }

    // Ensure tags are registered in the Tag database
    if (dto.tags && dto.tags.length > 0) {
      await this.tagsService.ensureTagsExist(orgId, dto.tags);
    }

    // Convert string IDs to Mongoose ObjectIds
    const ownerId = dto.ownerId ? new Types.ObjectId(dto.ownerId) : new Types.ObjectId(userId);
    const groups = dto.groups ? dto.groups.map(g => new Types.ObjectId(g)) : [];

    const contactData: Partial<Contact> = {
      ...dto,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      organizationId: new Types.ObjectId(orgId),
      ownerId,
      groups,
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
      customFields: new Map(Object.entries(validatedCustomFields)),
    };

    const contact = await this.create(orgId, contactData as any);

    // Emit asynchronous timeline activity event
    this.activityEmitter.emit('activity.logged', {
      orgId,
      userId,
      eventType: 'contact_created',
      description: `Contact ${contact.firstName} ${contact.lastName} was created`,
      linkedEntityId: contact._id.toString(),
      linkedEntityType: 'Contact',
    });

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'contact.created',
      description: `Contact ${contact.firstName} ${contact.lastName} was created`,
      metadata: {
        contactId: contact._id.toString(),
        name: `${contact.firstName} ${contact.lastName}`,
        email: contact.email,
      },
    });

    return contact;
  }

  async getContact(orgId: string, contactId: string): Promise<ContactDocument> {
    const contact = await this.findById(orgId, contactId);
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`);
    }
    return contact;
  }

  async updateContact(orgId: string, userId: string, contactId: string, dto: UpdateContactDto): Promise<ContactDocument> {
    const contact = await this.findById(orgId, contactId);
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`);
    }

    // Ensure tags are registered in the Tag database if provided
    if (dto.tags && dto.tags.length > 0) {
      await this.tagsService.ensureTagsExist(orgId, dto.tags);
    }

    const updateData: Partial<Contact> = {
      ...dto,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      updatedBy: new Types.ObjectId(userId),
    } as any;

    // Validate and update custom fields if provided
    if (dto.customFields) {
      // Merge new custom fields into existing custom fields map
      const mergedFields = {
        ...Object.fromEntries(contact.customFields || new Map()),
        ...dto.customFields,
      };
      const validatedFields = await this.customFieldsService.validateCustomFields(orgId, mergedFields);
      updateData.customFields = new Map(Object.entries(validatedFields));
    }

    if (dto.ownerId) {
      updateData.ownerId = new Types.ObjectId(dto.ownerId);
    }

    if (dto.groups) {
      updateData.groups = dto.groups.map(g => new Types.ObjectId(g));
    }

    const updated = await this.update(orgId, contactId, updateData);
    if (!updated) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`);
    }

    // Emit asynchronous timeline activity event
    this.activityEmitter.emit('activity.logged', {
      orgId,
      userId,
      eventType: 'contact_updated',
      description: `Contact ${updated.firstName} ${updated.lastName} was updated`,
      linkedEntityId: updated._id.toString(),
      linkedEntityType: 'Contact',
    });

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'contact.updated',
      description: `Contact ${updated.firstName} ${updated.lastName} was updated`,
      metadata: {
        contactId: updated._id.toString(),
        name: `${updated.firstName} ${updated.lastName}`,
        email: updated.email,
      },
    });

    return updated;
  }

  async removeContact(orgId: string, userId: string, contactId: string): Promise<void> {
    const contact = await this.findById(orgId, contactId);
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`);
    }
    const deleted = await this.delete(orgId, contactId);
    if (!deleted) {
      throw new NotFoundException(`Contact with ID ${contactId} not found`);
    }

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'contact.deleted',
      description: `Contact ${contact.firstName} ${contact.lastName} was deleted`,
      metadata: {
        contactId: contact._id.toString(),
        name: `${contact.firstName} ${contact.lastName}`,
        email: contact.email,
      },
    });
  }

  async findContacts(
    orgId: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      tags?: string[];
      groups?: string[];
      company?: string;
      ownerId?: string;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: QueryFilter<ContactDocument> = {
      organizationId: new Types.ObjectId(orgId),
    };

    // Global text searching
    if (params.search) {
      filter.$or = [
        { firstName: { $regex: params.search, $options: 'i' } },
        { lastName: { $regex: params.search, $options: 'i' } },
        { email: { $regex: params.search, $options: 'i' } },
        { company: { $regex: params.search, $options: 'i' } },
        { tags: { $in: [params.search] } },
      ];
    }

    if (params.tags && params.tags.length > 0) {
      filter.tags = { $all: params.tags };
    }

    if (params.groups && params.groups.length > 0) {
      filter.groups = { $in: params.groups.map(g => new Types.ObjectId(g)) };
    }

    if (params.company) {
      filter.company = { $regex: params.company, $options: 'i' };
    }

    if (params.ownerId) {
      filter.ownerId = new Types.ObjectId(params.ownerId);
    }

    const [data, total] = await Promise.all([
      this.contactModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('ownerId', 'firstName lastName email')
        .populate('groups', 'name')
        .exec(),
      this.contactModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async addTagsToContacts(orgId: string, userId: string, contactIds: string[], tags: string[]): Promise<number> {
    if (tags && tags.length > 0) {
      await this.tagsService.ensureTagsExist(orgId, tags);
    }

    const objectIds = contactIds.map(id => new Types.ObjectId(id));
    const result = await this.contactModel.updateMany(
      { _id: { $in: objectIds }, organizationId: new Types.ObjectId(orgId) },
      { $addToSet: { tags: { $each: tags } } }
    ).exec();

    if (result.modifiedCount > 0) {
      // Emit audit log event
      this.auditLogEmitter.emit('audit.log', {
        orgId,
        userId,
        action: 'contact.bulk_tag',
        description: `Added tags [${tags.join(', ')}] to ${result.modifiedCount} contacts`,
        metadata: {
          contactIds,
          tags,
          modifiedCount: result.modifiedCount,
        },
      });
    }

    return result.modifiedCount;
  }

  async removeTagsFromContacts(orgId: string, userId: string, contactIds: string[], tags: string[]): Promise<number> {
    const objectIds = contactIds.map(id => new Types.ObjectId(id));
    const result = await this.contactModel.updateMany(
      { _id: { $in: objectIds }, organizationId: new Types.ObjectId(orgId) },
      { $pull: { tags: { $in: tags } } }
    ).exec();

    if (result.modifiedCount > 0) {
      // Emit audit log event
      this.auditLogEmitter.emit('audit.log', {
        orgId,
        userId,
        action: 'contact.bulk_untag',
        description: `Removed tags [${tags.join(', ')}] from ${result.modifiedCount} contacts`,
        metadata: {
          contactIds,
          tags,
          modifiedCount: result.modifiedCount,
        },
      });
    }

    return result.modifiedCount;
  }
}
