import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  SUPER_ADMIN = 'Super Admin',
  ORG_ADMIN = 'Organization Admin',
  MANAGER = 'Manager',
  EMPLOYEE = 'Employee',
}

export enum UserStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
  SUSPENDED = 'Suspended',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    required: true,
  })
  role: UserRole;

  @Prop({
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Prop({
    type: Types.ObjectId,
    ref: 'Organization',
    index: true,
    // organizationId is required for non-Super Admins
    required: function (this: User) {
      return this.role !== UserRole.SUPER_ADMIN;
    },
  })
  organizationId?: Types.ObjectId;

  @Prop({ type: String })
  refreshTokenHash?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
