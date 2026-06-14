import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, QueryFilter } from 'mongoose';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { Task, TaskDocument, TaskStatus } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ActivityEmitter } from '../activities/activity-emitter';

@Injectable()
export class TasksService extends BaseTenantRepository<TaskDocument> {
  constructor(
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    private readonly activityEmitter: ActivityEmitter,
  ) {
    super(taskModel);
  }

  async createTask(orgId: string, userId: string, dto: CreateTaskDto): Promise<TaskDocument> {
    const taskData: Partial<Task> = {
      ...dto,
      organizationId: new Types.ObjectId(orgId),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assignedToId: dto.assignedToId ? new Types.ObjectId(dto.assignedToId) : undefined,
      linkedEntityId: dto.linkedEntityId ? new Types.ObjectId(dto.linkedEntityId) : undefined,
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
    };

    const task = await this.create(orgId, taskData as any);

    // Emit asynchronous timeline activity if linked to a Contact or Lead
    if (task.linkedEntityId && task.linkedEntityType) {
      this.activityEmitter.emit('activity.logged', {
        orgId,
        userId,
        eventType: 'task_created',
        description: `Task "${task.title}" was created`,
        linkedEntityId: task.linkedEntityId.toString(),
        linkedEntityType: task.linkedEntityType,
      });
    }

    return task;
  }

  async getTask(orgId: string, id: string): Promise<TaskDocument> {
    const task = await this.taskModel
      .findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(orgId) })
      .populate('assignedToId', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .exec();

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async findTasks(
    orgId: string,
    params: {
      status?: TaskStatus;
      assignedToId?: string;
      linkedEntityId?: string;
      linkedEntityType?: 'Contact' | 'Lead';
    },
  ): Promise<TaskDocument[]> {
    const filter: QueryFilter<TaskDocument> = {
      organizationId: new Types.ObjectId(orgId),
    };

    if (params.status) filter.status = params.status;
    if (params.assignedToId) {
      filter.assignedToId = new Types.ObjectId(params.assignedToId);
    }
    if (params.linkedEntityId) {
      filter.linkedEntityId = new Types.ObjectId(params.linkedEntityId);
    }
    if (params.linkedEntityType) {
      filter.linkedEntityType = params.linkedEntityType;
    }

    return this.taskModel
      .find(filter)
      .sort({ dueDate: 1, createdAt: -1 })
      .populate('assignedToId', 'firstName lastName email')
      .exec();
  }

  async updateTask(orgId: string, userId: string, id: string, dto: UpdateTaskDto): Promise<TaskDocument> {
    const task = await this.findById(orgId, id);
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const previousStatus = task.status;

    const updateData: Partial<Task> = {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assignedToId: dto.assignedToId ? new Types.ObjectId(dto.assignedToId) : undefined,
      linkedEntityId: dto.linkedEntityId ? new Types.ObjectId(dto.linkedEntityId) : undefined,
      updatedBy: new Types.ObjectId(userId),
    } as any;

    const updated = await this.update(orgId, id, updateData);
    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // Check if status is transitioning to Completed
    if (dto.status === TaskStatus.COMPLETED && previousStatus !== TaskStatus.COMPLETED) {
      if (updated.linkedEntityId && updated.linkedEntityType) {
        this.activityEmitter.emit('activity.logged', {
          orgId,
          userId,
          eventType: 'task_completed',
          description: `Task "${updated.title}" was completed`,
          linkedEntityId: updated.linkedEntityId.toString(),
          linkedEntityType: updated.linkedEntityType,
        });
      }
    }

    return this.getTask(orgId, id);
  }

  async removeTask(orgId: string, id: string): Promise<void> {
    const deleted = await this.delete(orgId, id);
    if (!deleted) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
  }
}
