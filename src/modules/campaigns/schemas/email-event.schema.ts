import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmailEventDocument = EmailEvent & Document;

@Schema({ timestamps: true })
export class EmailEvent {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true, index: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CampaignRecipient', required: true, index: true })
  recipientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Contact', required: true, index: true })
  contactId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: ['open', 'click', 'bounce', 'complaint', 'reply', 'unsubscribe'], index: true })
  eventType: string;

  @Prop({ trim: true })
  url?: string; // Target click URL (for click events only)

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ trim: true })
  browser?: string; // Parsed browser (Chrome, Safari, Firefox, etc.)

  @Prop({ trim: true })
  device?: string; // Parsed device (Mobile, Desktop, Tablet, etc.)
}

export const EmailEventSchema = SchemaFactory.createForClass(EmailEvent);
