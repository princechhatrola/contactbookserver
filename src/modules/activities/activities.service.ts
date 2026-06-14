import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, QueryFilter } from 'mongoose';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { Activity, ActivityDocument } from './schemas/activity.schema';
import { ActivityEmitter } from './activity-emitter';

@Injectable()
export class ActivitiesService extends BaseTenantRepository<ActivityDocument> implements OnModuleInit {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<ActivityDocument>,
    private readonly activityEmitter: ActivityEmitter,
  ) {
    super(activityModel);
  }

  onModuleInit() {
    // Subscribe to incoming timeline logging events asynchronously
    this.activityEmitter.on('activity.logged', async (eventData: {
      orgId: string;
      userId: string;
      eventType: string;
      description: string;
      linkedEntityId: string;
      linkedEntityType: 'Contact' | 'Lead' | 'Task';
      metadata?: any;
    }) => {
      try {
        await this.create(eventData.orgId, {
          organizationId: new Types.ObjectId(eventData.orgId),
          eventType: eventData.eventType,
          description: eventData.description,
          userId: new Types.ObjectId(eventData.userId),
          linkedEntityId: new Types.ObjectId(eventData.linkedEntityId),
          linkedEntityType: eventData.linkedEntityType,
          metadata: eventData.metadata ? new Map(Object.entries(eventData.metadata)) : undefined,
        } as any);
        this.logger.debug(`Async Activity Logged: [${eventData.eventType}] for ${eventData.linkedEntityType} ${eventData.linkedEntityId}`);
      } catch (err: any) {
        this.logger.error(`Failed to write activity log asynchronously: ${err.message}`);
      }
    });
  }

  async findActivities(
    orgId: string,
    params: {
      linkedEntityId?: string;
      linkedEntityType?: 'Contact' | 'Lead' | 'Task';
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const skip = (page - 1) * limit;

    const filter: QueryFilter<ActivityDocument> = {
      organizationId: new Types.ObjectId(orgId),
    };

    if (params.linkedEntityId) {
      filter.linkedEntityId = new Types.ObjectId(params.linkedEntityId);
    }
    if (params.linkedEntityType) {
      filter.linkedEntityType = params.linkedEntityType;
    }

    const [data, total] = await Promise.all([
      this.activityModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'firstName lastName email')
        .exec(),
      this.activityModel.countDocuments(filter).exec(),
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
