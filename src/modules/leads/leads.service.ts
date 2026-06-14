import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, QueryFilter } from 'mongoose';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { Lead, LeadDocument, LeadStatus, LeadSource } from './schemas/lead.schema';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ActivityEmitter } from '../activities/activity-emitter';
import { AuditLogEmitter } from '../audit-logs/audit-log-emitter';

@Injectable()
export class LeadsService extends BaseTenantRepository<LeadDocument> {
  constructor(
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    private readonly activityEmitter: ActivityEmitter,
    private readonly auditLogEmitter: AuditLogEmitter,
  ) {
    super(leadModel);
  }

  async createLead(orgId: string, userId: string, dto: CreateLeadDto): Promise<LeadDocument> {
    const initialStatus = dto.status || LeadStatus.NEW;
    
    // Create initial history log
    const historyEntry = {
      status: initialStatus,
      changedBy: new Types.ObjectId(userId),
      changedAt: new Date(),
      notes: dto.notes || 'Lead initialized',
    };

    const leadData: Partial<Lead> = {
      organizationId: new Types.ObjectId(orgId),
      contactId: new Types.ObjectId(dto.contactId),
      source: dto.source || LeadSource.MANUAL,
      status: initialStatus,
      value: dto.value || 0,
      ownerId: dto.ownerId ? new Types.ObjectId(dto.ownerId) : new Types.ObjectId(userId),
      history: [historyEntry],
    };

    const lead = await this.create(orgId, leadData as any);

    // Emit asynchronous timeline activity event
    this.activityEmitter.emit('activity.logged', {
      orgId,
      userId,
      eventType: 'lead_created',
      description: `Lead opportunity created with value $${lead.value}`,
      linkedEntityId: lead._id.toString(),
      linkedEntityType: 'Lead',
    });

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'lead.created',
      description: `Lead opportunity created with value $${lead.value}`,
      metadata: {
        leadId: lead._id.toString(),
        contactId: lead.contactId.toString(),
        value: lead.value,
        status: lead.status,
      },
    });

    return lead;
  }

  async getLead(orgId: string, leadId: string): Promise<LeadDocument> {
    const lead = await this.leadModel
      .findOne({ _id: new Types.ObjectId(leadId), organizationId: new Types.ObjectId(orgId) })
      .populate('contactId')
      .populate('ownerId', 'firstName lastName email')
      .populate('history.changedBy', 'firstName lastName email')
      .exec();

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }
    return lead;
  }

  async updateLead(orgId: string, userId: string, leadId: string, dto: UpdateLeadDto): Promise<LeadDocument> {
    const lead = await this.findById(orgId, leadId);
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }

    const updateData: Partial<Lead> = {};

    if (dto.source) updateData.source = dto.source;
    if (dto.value !== undefined) updateData.value = dto.value;
    
    if (dto.ownerId) {
      updateData.ownerId = new Types.ObjectId(dto.ownerId);
    }

    // Check if status has transitioned
    if (dto.status && dto.status !== lead.status) {
      updateData.status = dto.status;
      
      // Push transition to history log
      const historyEntry = {
        status: dto.status,
        changedBy: new Types.ObjectId(userId),
        changedAt: new Date(),
        notes: dto.notes || `Lead status transitioned to ${dto.status}`,
      };

      await this.leadModel.updateOne(
        { _id: new Types.ObjectId(leadId) },
        { $push: { history: historyEntry } }
      ).exec();
    }

    const oldStatus = lead.status;
    const updated = await this.update(orgId, leadId, updateData);
    if (!updated) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }

    // Emit asynchronous timeline activity event if status changed
    if (dto.status && dto.status !== oldStatus) {
      this.activityEmitter.emit('activity.logged', {
        orgId,
        userId,
        eventType: 'lead_status_changed',
        description: `Lead status changed from ${oldStatus} to ${dto.status}`,
        linkedEntityId: updated._id.toString(),
        linkedEntityType: 'Lead',
      });
    }

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'lead.updated',
      description: `Lead opportunity updated`,
      metadata: {
        leadId: updated._id.toString(),
        value: updated.value,
        status: updated.status,
        oldStatus,
      },
    });

    return this.getLead(orgId, leadId);
  }

  async removeLead(orgId: string, userId: string, leadId: string): Promise<void> {
    const lead = await this.findById(orgId, leadId);
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }
    const deleted = await this.delete(orgId, leadId);
    if (!deleted) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'lead.deleted',
      description: `Lead opportunity was deleted`,
      metadata: {
        leadId: lead._id.toString(),
        contactId: lead.contactId.toString(),
        value: lead.value,
      },
    });
  }

  async findLeads(
    orgId: string,
    params: {
      page?: number;
      limit?: number;
      status?: LeadStatus;
      source?: LeadSource;
      ownerId?: string;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: QueryFilter<LeadDocument> = {
      organizationId: new Types.ObjectId(orgId),
    };

    if (params.status) filter.status = params.status;
    if (params.source) filter.source = params.source;
    
    if (params.ownerId) {
      filter.ownerId = new Types.ObjectId(params.ownerId);
    }

    const [data, total] = await Promise.all([
      this.leadModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('contactId', 'firstName lastName email company mobile')
        .populate('ownerId', 'firstName lastName email')
        .exec(),
      this.leadModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getPipelineStats(orgId: string) {
    const stats = await this.leadModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(orgId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$value' },
        },
      },
    ]).exec();

    // Map results to a key-value dictionary for easy consumption
    const pipelineData = Object.values(LeadStatus).reduce((acc, status) => {
      acc[status] = { count: 0, totalValue: 0 };
      return acc;
    }, {} as Record<string, { count: number; totalValue: number }>);

    stats.forEach((row) => {
      if (pipelineData[row._id]) {
        pipelineData[row._id] = {
          count: row.count,
          totalValue: row.totalValue,
        };
      }
    });

    return pipelineData;
  }
}
