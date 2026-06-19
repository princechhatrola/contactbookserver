import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmailProviderDocument = EmailProvider & Document;

export enum ProviderType {
  SMTP = 'smtp',
  SES = 'ses',
  SENDGRID = 'sendgrid',
  RESEND = 'resend',
  MAILGUN = 'mailgun',
  GMAIL = 'gmail',
  OUTLOOK = 'outlook',
}

export enum ProviderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PAUSED_BOUNCES = 'paused_bounces',
  ERROR = 'error',
}

@Schema({ timestamps: true })
export class EmailProvider {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, type: String, enum: Object.values(ProviderType) })
  type: ProviderType;

  @Prop({ required: true })
  credentials: string; // Encrypted credentials payload (JSON stringified)

  @Prop({ type: Number, default: 0 })
  dailyLimit: number; // 0 for unlimited

  @Prop({ type: Number, default: 0 })
  hourlyLimit: number;

  @Prop({ type: Number, default: 0 })
  rateLimitPerMin: number;

  @Prop({ type: Boolean, default: false })
  warmupMode: boolean;

  @Prop({ type: Date })
  warmupStartDate?: Date;

  @Prop({ type: Number, default: 5.0 })
  bounceThreshold: number; // percentage, e.g., 5.0%

  @Prop({ required: true, type: String, enum: Object.values(ProviderStatus), default: ProviderStatus.ACTIVE })
  status: ProviderStatus;

  @Prop({ type: Number, default: 1 })
  priority: number; // Lower means higher priority for provider rotation

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted: boolean;
}

export const EmailProviderSchema = SchemaFactory.createForClass(EmailProvider);
