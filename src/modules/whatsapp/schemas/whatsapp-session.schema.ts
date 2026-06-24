import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappSessionDocument = WhatsappSession & Document;

@Schema({ timestamps: true })
export class WhatsappSession {
  @Prop({ type: Types.ObjectId, ref: 'WhatsappProvider', required: true, index: true })
  providerId: Types.ObjectId;

  @Prop({ required: true, index: true })
  key: string; // E.g., 'creds' or 'keys:app-state-sync-key:123...'

  @Prop({ required: true })
  data: string; // JSON-serialized Baileys credentials or keys (using BufferJSON.replacer)
}

export const WhatsappSessionSchema = SchemaFactory.createForClass(WhatsappSession);
