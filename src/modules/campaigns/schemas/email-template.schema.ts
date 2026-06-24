import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmailTemplateDocument = EmailTemplate & Document;

@Schema({ timestamps: true })
export class EmailTemplate {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, trim: true })
  subject: string; // Supports handlebars placeholders like {{firstName}}

  @Prop({ required: true })
  htmlContent: string; // Raw HTML template content containing placeholders

  @Prop({ trim: true })
  textContent?: string; // Plain text backup alternative

  @Prop({ type: [String], default: [] })
  variables: string[]; // Autocomputed list of unique placeholders found in content

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

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);
