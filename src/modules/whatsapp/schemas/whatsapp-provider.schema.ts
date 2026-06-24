import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappProviderDocument = WhatsappProvider & Document;

export enum WhatsappProviderStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  QR_READY = 'qr_ready',
  CONNECTED = 'connected',
  ERROR = 'error',
}

@Schema({ timestamps: true })
export class WhatsappProvider {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  phoneNumber?: string; // Populated after scanning QR and connecting

  @Prop({ type: String, enum: Object.values(WhatsappProviderStatus), default: WhatsappProviderStatus.DISCONNECTED })
  status: WhatsappProviderStatus;

  @Prop()
  qrCode?: string; // The raw QR text to render on client

  @Prop({ type: Number, default: 10 })
  rateLimitPerMin: number; // Max messages per minute (default 10)

  @Prop({ type: Number, default: 200 })
  hourlyLimit: number; // Max messages per hour

  @Prop({ type: Number, default: 1000 })
  dailyLimit: number; // Max messages per day

  @Prop({ type: Number, default: 1 })
  priority: number; // For rotation order (lower = higher priority)

  @Prop({ trim: true })
  error?: string; // Connection or initialization error messages

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted: boolean;
}

export const WhatsappProviderSchema = SchemaFactory.createForClass(WhatsappProvider);
