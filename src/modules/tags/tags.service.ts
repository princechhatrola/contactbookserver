import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { Tag, TagDocument } from './schemas/tag.schema';
import { Contact, ContactDocument } from '../contacts/schemas/contact.schema';
import { CreateTagDto } from './dto/create-tag.dto';

@Injectable()
export class TagsService extends BaseTenantRepository<TagDocument> {
  constructor(
    @InjectModel(Tag.name)
    private readonly tagModel: Model<TagDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
  ) {
    super(tagModel);
  }

  async createTag(orgId: string, dto: CreateTagDto): Promise<TagDocument> {
    const exists = await this.tagModel.findOne({
      organizationId: new Types.ObjectId(orgId),
      name: { $regex: new RegExp(`^${dto.name.trim()}$`, 'i') },
    }).exec();

    if (exists) {
      throw new BadRequestException(`Tag with name "${dto.name}" already exists`);
    }

    return this.create(orgId, {
      name: dto.name.trim(),
      organizationId: new Types.ObjectId(orgId) as any,
    });
  }

  async getTags(orgId: string): Promise<TagDocument[]> {
    return this.find(orgId, {}, { sort: { name: 1 } });
  }

  async deleteTag(orgId: string, tagId: string): Promise<void> {
    const tag = await this.findById(orgId, tagId);
    if (!tag) {
      throw new NotFoundException(`Tag with ID ${tagId} not found`);
    }

    // Pull tag name from all contacts in this organization
    await this.contactModel.updateMany(
      { organizationId: new Types.ObjectId(orgId), tags: tag.name },
      { $pull: { tags: tag.name } }
    ).exec();

    await this.delete(orgId, tagId);
  }

  async ensureTagsExist(orgId: string, names: string[]): Promise<void> {
    const trimmedNames = names.map(n => n.trim()).filter(Boolean);
    if (trimmedNames.length === 0) return;

    // Find existing tags in organization
    const existing = await this.tagModel.find({
      organizationId: new Types.ObjectId(orgId),
      name: { $in: trimmedNames },
    }).exec();

    const existingNamesLower = new Set(existing.map(t => t.name.toLowerCase()));

    // Find tags that need to be created
    const toCreate = trimmedNames.filter(name => !existingNamesLower.has(name.toLowerCase()));

    if (toCreate.length > 0) {
      const docs = toCreate.map(name => ({
        name,
        organizationId: new Types.ObjectId(orgId),
      }));
      await this.tagModel.insertMany(docs);
    }
  }
}
