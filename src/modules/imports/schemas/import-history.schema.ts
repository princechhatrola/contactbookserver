import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ImportHistoryDocument = ImportHistory & Document;

export enum ImportStatus {
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  COMPLETED = 'Completed',
  FAILED = 'Failed',
}

@Schema({ timestamps: true })
export class ImportHistory {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fileName: string;

  @Prop({ default: 0 })
  totalRecords: number;

  @Prop({ default: 0 })
  successCount: number;

  @Prop({ default: 0 })
  failureCount: number;

  @Prop({ required: true, enum: ImportStatus, default: ImportStatus.PENDING })
  status: ImportStatus;

  @Prop({ type: [{ row: Number, name: String, error: String }], default: [] })
  rowErrors: { row: number; name?: string; error: string }[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const ImportHistorySchema = SchemaFactory.createForClass(ImportHistory);
ImportHistorySchema.index({ organizationId: 1, createdAt: -1 });
