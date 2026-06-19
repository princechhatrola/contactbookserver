import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SenderIdentityDocument = SenderIdentity & Document;

@Schema({ timestamps: true })
export class SenderIdentity {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'EmailProvider', required: true, index: true })
  emailProviderId: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isVerified: boolean;

  @Prop({ type: Boolean, default: false })
  isDefault: boolean;

  @Prop({ type: Number, default: 100 })
  reputationScore: number; // 0-100 reputation tracking score

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted: boolean;
}

export const SenderIdentitySchema = SchemaFactory.createForClass(SenderIdentity);
