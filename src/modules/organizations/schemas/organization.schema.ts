import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrganizationDocument = Organization & Document;

export enum OrganizationStatus {
  ACTIVE = 'Active',
  SUSPENDED = 'Suspended',
  DELETED = 'Deleted',
}

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  logo?: string;

  @Prop({ trim: true })
  industry?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  state?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true, default: 'UTC' })
  timezone: string;

  @Prop({
    type: String,
    enum: Object.values(OrganizationStatus),
    default: OrganizationStatus.ACTIVE,
  })
  status: OrganizationStatus;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
