import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GroupDocument = Group & Document;

@Schema({ timestamps: true })
export class Group {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;
}

export const GroupSchema = SchemaFactory.createForClass(Group);

// Set compound unique index for name within the organization
GroupSchema.index({ organizationId: 1, name: 1 }, { unique: true });
