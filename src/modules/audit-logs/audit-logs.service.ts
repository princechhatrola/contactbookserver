import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, QueryFilter } from 'mongoose';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { AuditLogEmitter } from './audit-log-emitter';

@Injectable()
export class AuditLogsService extends BaseTenantRepository<AuditLogDocument> implements OnModuleInit {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly auditLogEmitter: AuditLogEmitter,
  ) {
    super(auditLogModel);
  }

  onModuleInit() {
    // Listen to audit logging events asynchronously
    this.auditLogEmitter.on('audit.log', async (eventData: {
      orgId: string;
      userId: string;
      action: string;
      description: string;
      ipAddress?: string;
      userAgent?: string;
      metadata?: any;
    }) => {
      try {
        await this.create(eventData.orgId, {
          organizationId: new Types.ObjectId(eventData.orgId),
          userId: new Types.ObjectId(eventData.userId),
          action: eventData.action,
          description: eventData.description,
          ipAddress: eventData.ipAddress,
          userAgent: eventData.userAgent,
          metadata: eventData.metadata ? new Map(Object.entries(eventData.metadata)) : undefined,
        } as any);
        this.logger.debug(`Audit Log Written: [${eventData.action}] by User ${eventData.userId}`);
      } catch (err: any) {
        this.logger.error(`Failed to write audit log asynchronously: ${err.message}`);
      }
    });
  }

  async queryLogs(
    orgId: string,
    params: {
      userId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const skip = (page - 1) * limit;

    const filter: QueryFilter<AuditLogDocument> = {
      organizationId: new Types.ObjectId(orgId),
    };

    if (params.userId) {
      filter.userId = new Types.ObjectId(params.userId);
    }

    if (params.action) {
      filter.action = params.action;
    }

    if (params.startDate || params.endDate) {
      filter.createdAt = {};
      if (params.startDate) {
        filter.createdAt.$gte = new Date(params.startDate);
      }
      if (params.endDate) {
        filter.createdAt.$lte = new Date(params.endDate);
      }
    }

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'firstName lastName email role')
        .exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }
}
