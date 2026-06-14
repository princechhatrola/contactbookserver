import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, index: true, unique: true })
  hashedKey: string;

  @Prop({ required: true, trim: true })
  keyPreview: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Date })
  lastUsedAt?: Date;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ organizationId: 1, createdAt: -1 });
