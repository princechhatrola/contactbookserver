import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AudienceSegmentFilterDto } from '../../campaigns/dto/audience-segment-filter.dto';

export type WhatsappCampaignDocument = WhatsappCampaign & Document;

@Schema({ timestamps: true })
export class WhatsappCampaign {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  messageBody: string; // The campaign message content (with spintax and contact variables)

  @Prop({ type: Types.ObjectId, ref: 'WhatsappProvider' })
  whatsappProviderId?: Types.ObjectId; // Selected sending provider (optional if auto-rotate is true)

  @Prop({ type: Boolean, default: true })
  autoRotate: boolean; // Rotate across available active numbers if true

  @Prop({ type: Object, required: true })
  segmentFilters: AudienceSegmentFilterDto;

  @Prop({
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled'],
    default: 'draft',
    index: true,
  })
  status: string;

  @Prop({ type: Date, index: true })
  scheduledAt?: Date;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Number, default: 0 })
  totalRecipients: number;

  @Prop({ type: Number, default: 0 })
  sentRecipients: number;

  @Prop({ type: Number, default: 0 })
  failedRecipients: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdById?: Types.ObjectId;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted: boolean;
}

export const WhatsappCampaignSchema = SchemaFactory.createForClass(WhatsappCampaign);
