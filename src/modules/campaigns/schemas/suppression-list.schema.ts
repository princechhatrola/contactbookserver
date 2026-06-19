import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SuppressionListDocument = SuppressionList & Document;

export enum SuppressionReason {
  BOUNCE_HARD = 'bounce_hard',
  COMPLAINT = 'complaint',
  UNSUBSCRIBE = 'unsubscribe',
  MANUAL = 'manual',
}

@Schema({ timestamps: true })
export class SuppressionList {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  email: string;

  @Prop({ required: true, enum: Object.values(SuppressionReason) })
  reason: string;
}

export const SuppressionListSchema = SchemaFactory.createForClass(SuppressionList);

// Compound index to ensure uniqueness of email within each organization
SuppressionListSchema.index({ organizationId: 1, email: 1 }, { unique: true });
