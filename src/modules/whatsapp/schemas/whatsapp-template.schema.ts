import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsappTemplateDocument = WhatsappTemplate & Document;

@Schema({ timestamps: true })
export class WhatsappTemplate {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true })
  body: string; // Message content with spintax and placeholders, e.g. "Hello {{firstName}}!"

  @Prop({ type: [String], default: [] })
  variables: string[]; // Autocomputed list of unique variables found in body

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

export const WhatsappTemplateSchema = SchemaFactory.createForClass(WhatsappTemplate);
