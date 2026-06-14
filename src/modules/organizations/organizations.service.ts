import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization, OrganizationDocument, OrganizationStatus } from './schemas/organization.schema';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly organizationModel: Model<OrganizationDocument>,
  ) {}

  async create(name: string, extraFields: Partial<Organization> = {}): Promise<OrganizationDocument> {
    const createdOrg = new this.organizationModel({
      name,
      ...extraFields,
    });
    return createdOrg.save();
  }

  async findById(id: string): Promise<OrganizationDocument> {
    const org = await this.organizationModel.findById(id);
    if (!org) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return org;
  }

  async update(id: string, updateData: Partial<Organization>): Promise<OrganizationDocument> {
    const updated = await this.organizationModel.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return updated;
  }

  async setStatus(id: string, status: OrganizationStatus): Promise<OrganizationDocument> {
    return this.update(id, { status });
  }

  async findAll(): Promise<OrganizationDocument[]> {
    return this.organizationModel.find().exec();
  }
}
