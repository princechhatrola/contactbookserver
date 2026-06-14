import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TagDocument = Tag & Document;

@Schema({ timestamps: true })
export class Tag {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;
}

export const TagSchema = SchemaFactory.createForClass(Tag);

// Set compound unique index for name within the organization
TagSchema.index({ organizationId: 1, name: 1 }, { unique: true });
