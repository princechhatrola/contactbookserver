import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContactDocument = Contact & Document;

@Schema({ timestamps: true })
export class Contact {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  // Personal Information
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ lowercase: true, trim: true, index: true })
  email?: string;

  @Prop({ trim: true })
  mobile?: string;

  @Prop({ trim: true })
  alternateMobile?: string;

  @Prop({ type: Date })
  dateOfBirth?: Date;

  @Prop({ trim: true })
  gender?: string;

  // Business Information
  @Prop({ trim: true, index: true })
  company?: string;

  @Prop({ trim: true })
  jobTitle?: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ trim: true })
  industry?: string;

  // Address Information
  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  state?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  zipCode?: string;

  @Prop({ trim: true })
  address?: string;

  // Social Information
  @Prop({ trim: true })
  linkedIn?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  twitter?: string;

  @Prop({ trim: true })
  facebook?: string;

  @Prop({ trim: true })
  instagram?: string;

  // Ownership Details
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  managerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  // Custom Fields (Dynamic metadata map)
  @Prop({ type: Map, of: Object, default: {} })
  customFields: Map<string, any>;

  // Groups and Tags
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Group' }], default: [] })
  groups: Types.ObjectId[];

  @Prop({ type: [String], default: [], index: true })
  tags: string[];
}

export const ContactSchema = SchemaFactory.createForClass(Contact);

// Create compound index for global text searching across contact name, email, company, and tags
ContactSchema.index({
  firstName: 'text',
  lastName: 'text',
  email: 'text',
  company: 'text',
  tags: 'text',
});
