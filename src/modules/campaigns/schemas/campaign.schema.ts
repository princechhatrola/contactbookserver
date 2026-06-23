import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AudienceSegmentFilterDto } from '../dto/audience-segment-filter.dto';

export type CampaignDocument = Campaign & Document;

@Schema({ timestamps: true })
export class Campaign {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ type: Types.ObjectId, ref: 'EmailTemplate', required: true })
  emailTemplateId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EmailProvider', required: true })
  emailProviderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SenderIdentity', required: true })
  senderIdentityId: Types.ObjectId;

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

  @Prop({
    type: [{
      filename: { type: String, required: true },
      path: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
    }],
    default: [],
  })
  attachments?: {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  }[];
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
