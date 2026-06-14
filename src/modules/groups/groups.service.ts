import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { Group, GroupDocument } from './schemas/group.schema';
import { Contact, ContactDocument } from '../contacts/schemas/contact.schema';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService extends BaseTenantRepository<GroupDocument> {
  constructor(
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
  ) {
    super(groupModel);
  }

  async createGroup(orgId: string, dto: CreateGroupDto): Promise<GroupDocument> {
    // Check if group name already exists for this organization
    const exists = await this.groupModel.findOne({
      organizationId: new Types.ObjectId(orgId),
      name: { $regex: new RegExp(`^${dto.name.trim()}$`, 'i') },
    }).exec();

    if (exists) {
      throw new BadRequestException(`Group with name "${dto.name}" already exists`);
    }

    return this.create(orgId, {
      name: dto.name.trim(),
      description: dto.description?.trim(),
      organizationId: new Types.ObjectId(orgId) as any,
    });
  }

  async getGroups(orgId: string): Promise<GroupDocument[]> {
    return this.find(orgId, {}, { sort: { name: 1 } });
  }

  async getGroup(orgId: string, groupId: string): Promise<GroupDocument> {
    const group = await this.findById(orgId, groupId);
    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }
    return group;
  }

  async updateGroup(orgId: string, groupId: string, dto: UpdateGroupDto): Promise<GroupDocument> {
    const group = await this.findById(orgId, groupId);
    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    if (dto.name && dto.name.trim().toLowerCase() !== group.name.toLowerCase()) {
      const exists = await this.groupModel.findOne({
        organizationId: new Types.ObjectId(orgId),
        name: { $regex: new RegExp(`^${dto.name.trim()}$`, 'i') },
        _id: { $ne: new Types.ObjectId(groupId) },
      }).exec();

      if (exists) {
        throw new BadRequestException(`Another group with name "${dto.name}" already exists`);
      }
    }

    const updateData: Partial<Group> = {};
    if (dto.name) updateData.name = dto.name.trim();
    if (dto.description !== undefined) updateData.description = dto.description.trim();

    const updated = await this.update(orgId, groupId, updateData);
    if (!updated) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }
    return updated;
  }

  async deleteGroup(orgId: string, groupId: string): Promise<void> {
    const group = await this.findById(orgId, groupId);
    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    // 1. Pull this groupId from all contacts in this organization
    await this.contactModel.updateMany(
      { organizationId: new Types.ObjectId(orgId), groups: new Types.ObjectId(groupId) },
      { $pull: { groups: new Types.ObjectId(groupId) } }
    ).exec();

    // 2. Delete the group
    await this.delete(orgId, groupId);
  }

  async addContactsToGroup(orgId: string, groupId: string, contactIds: string[]): Promise<number> {
    // Verify group exists
    const group = await this.findById(orgId, groupId);
    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    const objectIds = contactIds.map(id => new Types.ObjectId(id));
    const result = await this.contactModel.updateMany(
      { _id: { $in: objectIds }, organizationId: new Types.ObjectId(orgId) },
      { $addToSet: { groups: new Types.ObjectId(groupId) } }
    ).exec();

    return result.modifiedCount;
  }

  async removeContactsFromGroup(orgId: string, groupId: string, contactIds: string[]): Promise<number> {
    // Verify group exists
    const group = await this.findById(orgId, groupId);
    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    const objectIds = contactIds.map(id => new Types.ObjectId(id));
    const result = await this.contactModel.updateMany(
      { _id: { $in: objectIds }, organizationId: new Types.ObjectId(orgId) },
      { $pull: { groups: new Types.ObjectId(groupId) } }
    ).exec();

    return result.modifiedCount;
  }
}
