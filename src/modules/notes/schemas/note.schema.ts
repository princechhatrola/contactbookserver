import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NoteDocument = Note & Document;

@Schema({ _id: false })
export class NoteAttachment {
  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ type: Number, required: true })
  size: number;

  @Prop({ required: true })
  path: string;
}

@Schema({ timestamps: true })
export class Note {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  content: string; // Dynamic HTML/Rich text or Markdown plain content

  @Prop({ type: [NoteAttachment], default: [] })
  attachments: NoteAttachment[];

  @Prop({ type: Types.ObjectId, required: true, index: true })
  linkedEntityId: Types.ObjectId;

  @Prop({ type: String, enum: ['Contact', 'Lead', 'Task'], required: true, index: true })
  linkedEntityType: 'Contact' | 'Lead' | 'Task';

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  updatedBy: Types.ObjectId;
}

export const NoteSchema = SchemaFactory.createForClass(Note);

// Fast search of notes linked to a specific entity
NoteSchema.index({ organizationId: 1, linkedEntityId: 1, linkedEntityType: 1, createdAt: -1 });
