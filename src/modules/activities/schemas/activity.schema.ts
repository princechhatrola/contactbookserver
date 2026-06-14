import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ActivityDocument = Activity & Document;

@Schema({ timestamps: true })
export class Activity {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, index: true })
  eventType: string; // e.g. contact_created, lead_status_changed, task_completed, note_added

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  linkedEntityId: Types.ObjectId;

  @Prop({ type: String, enum: ['Contact', 'Lead', 'Task'], required: true, index: true })
  linkedEntityType: 'Contact' | 'Lead' | 'Task';

  @Prop({ type: Map, of: Object, default: {} })
  metadata?: Map<string, any>;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// Fast search for timeline feeds scoped to specific contacts or leads
ActivitySchema.index({ organizationId: 1, linkedEntityId: 1, linkedEntityType: 1, createdAt: -1 });
