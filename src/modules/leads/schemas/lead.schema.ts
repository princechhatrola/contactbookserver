import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeadDocument = Lead & Document;

export enum LeadSource {
  MANUAL = 'Manual',
  WEBSITE = 'Website',
  REFERRAL = 'Referral',
  PARTNER = 'Partner',
  IMPORT = 'Import',
  API = 'API',
}

export enum LeadStatus {
  NEW = 'New',
  CONTACTED = 'Contacted',
  QUALIFIED = 'Qualified',
  PROPOSAL = 'Proposal',
  WON = 'Won',
  LOST = 'Lost',
}

@Schema({ _id: false })
export class LeadHistoryEntry {
  @Prop({ type: String, enum: Object.values(LeadStatus), required: true })
  status: LeadStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  changedBy: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  changedAt: Date;

  @Prop({ trim: true })
  notes?: string;
}

@Schema({ timestamps: true })
export class Lead {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Contact', required: true, index: true })
  contactId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(LeadSource),
    default: LeadSource.MANUAL,
  })
  source: LeadSource;

  @Prop({
    type: String,
    enum: Object.values(LeadStatus),
    default: LeadStatus.NEW,
    index: true,
  })
  status: LeadStatus;

  @Prop({ type: Number, default: 0 })
  value: number;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerId?: Types.ObjectId;

  @Prop({ type: [LeadHistoryEntry], default: [] })
  history: LeadHistoryEntry[];
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
