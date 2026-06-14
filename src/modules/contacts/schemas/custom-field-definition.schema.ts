import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomFieldDefinitionDocument = CustomFieldDefinition & Document;

export enum CustomFieldType {
  TEXT = 'Text',
  TEXT_AREA = 'Text Area',
  NUMBER = 'Number',
  DATE = 'Date',
  BOOLEAN = 'Boolean',
  DROPDOWN = 'Dropdown',
  MULTI_SELECT = 'Multi Select',
  URL = 'URL',
  EMAIL = 'Email',
  PHONE = 'Phone',
}

@Schema({ timestamps: true })
export class CustomFieldDefinition {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    validate: {
      validator: function (v: string) {
        return /^[a-z0-9_]+$/.test(v);
      },
      message: (props: any) => `${props.value} is not a valid custom field key! Keys must be alphanumeric and lowercase with underscores only.`,
    },
  })
  key: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({
    type: String,
    enum: Object.values(CustomFieldType),
    required: true,
  })
  type: CustomFieldType;

  @Prop({ type: [String], default: [] })
  options: string[];

  @Prop({ type: Boolean, default: false })
  required: boolean;
}

export const CustomFieldDefinitionSchema = SchemaFactory.createForClass(CustomFieldDefinition);

// Create compound index to enforce uniqueness of custom field keys per organization
CustomFieldDefinitionSchema.index({ organizationId: 1, key: 1 }, { unique: true });
