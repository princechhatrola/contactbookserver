import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  action: string; // e.g. auth.login, contact.created, lead.deleted, import.completed

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ type: Map, of: Object, default: {} })
  metadata?: Map<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Index for paginated lookups, sorting by createdAt descending
AuditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
