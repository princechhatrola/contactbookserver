import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampaignRecipientDocument = CampaignRecipient & Document;

@Schema({ timestamps: true })
export class CampaignRecipient {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true, index: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Contact', required: true, index: true })
  contactId: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  email: string;

  @Prop({
    type: String,
    enum: ['pending', 'sent', 'failed', 'bounced', 'complaint'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop({ trim: true })
  error?: string;

  @Prop({ type: Date })
  sentAt?: Date;

  @Prop({ type: Date })
  openedAt?: Date;

  @Prop({ type: Date })
  clickedAt?: Date;
}

export const CampaignRecipientSchema = SchemaFactory.createForClass(CampaignRecipient);
