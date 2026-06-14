import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskDocument = Task & Document;

export enum TaskStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
}

export enum TaskPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(TaskStatus),
    default: TaskStatus.PENDING,
    index: true,
  })
  status: TaskStatus;

  @Prop({
    type: String,
    enum: Object.values(TaskPriority),
    default: TaskPriority.MEDIUM,
    index: true,
  })
  priority: TaskPriority;

  @Prop({ type: Date, index: true })
  dueDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  assignedToId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  linkedEntityId?: Types.ObjectId;

  @Prop({ type: String, enum: ['Contact', 'Lead'], index: true })
  linkedEntityType?: 'Contact' | 'Lead';

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  updatedBy: Types.ObjectId;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

// Fast search of tasks linked to a contact or lead
TaskSchema.index({ organizationId: 1, linkedEntityId: 1, linkedEntityType: 1 });
