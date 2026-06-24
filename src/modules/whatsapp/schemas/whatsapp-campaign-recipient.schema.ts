import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappCampaignRecipientDocument = WhatsappCampaignRecipient & Document;

@Schema({ timestamps: true })
export class WhatsappCampaignRecipient {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'WhatsappCampaign', required: true, index: true })
  whatsappCampaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Contact', required: true, index: true })
  contactId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  phoneNumber: string; // The recipient's formatted phone number

  @Prop({ type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending', index: true })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'WhatsappProvider' })
  sentFromProviderId?: Types.ObjectId; // Tracks which account was used to send this message

  @Prop({ type: Date })
  sentAt?: Date;

  @Prop()
  error?: string;
}

export const WhatsappCampaignRecipientSchema = SchemaFactory.createForClass(WhatsappCampaignRecipient);
