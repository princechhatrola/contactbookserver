import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExportJobDocument = ExportJob & Document;

export enum ExportEntityType {
  CONTACTS = 'Contacts',
  LEADS = 'Leads',
  TASKS = 'Tasks',
  GROUPS = 'Groups',
}

export enum ExportFormat {
  CSV = 'CSV',
  XLSX = 'XLSX',
  JSON = 'JSON',
}

export enum ExportStatus {
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  COMPLETED = 'Completed',
  FAILED = 'Failed',
}

@Schema({ timestamps: true })
export class ExportJob {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, enum: ExportEntityType })
  entityType: ExportEntityType;

  @Prop({ required: true, enum: ExportFormat })
  format: ExportFormat;

  @Prop({ required: true, enum: ExportStatus, default: ExportStatus.PENDING })
  status: ExportStatus;

  @Prop({ trim: true })
  fileName?: string;

  @Prop({ trim: true })
  filePath?: string;

  @Prop({ default: 0 })
  totalRecords?: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Group', required: false })
  groupId?: Types.ObjectId;
}

export const ExportJobSchema = SchemaFactory.createForClass(ExportJob);
ExportJobSchema.index({ organizationId: 1, createdAt: -1 });
