import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DomainAuthenticationDocument = DomainAuthentication & Document;

@Schema({ timestamps: true })
export class DomainAuthentication {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  domain: string;

  @Prop({ required: true })
  spfRecord: string; // Expected SPF value, e.g., "v=spf1 include:relay.contactflow.io ~all"

  @Prop({ type: Boolean, default: false })
  spfVerified: boolean;

  @Prop({ required: true, default: 'cf' })
  dkimSelector: string;

  @Prop({ required: true })
  dkimRecord: string; // Expected DKIM record value (contains formatted public key)

  @Prop({ required: true })
  dkimPrivateKey: string; // Encrypted private key

  @Prop({ required: true })
  dkimPublicKey: string; // Public key PEM (raw public key value)

  @Prop({ type: Boolean, default: false })
  dkimVerified: boolean;

  @Prop({ required: true })
  dmarcRecord: string; // Expected DMARC record, e.g., "v=DMARC1; p=none;..."

  @Prop({ type: Boolean, default: false })
  dmarcVerified: boolean;

  @Prop({ type: Date })
  lastCheckedAt?: Date;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted: boolean;
}

export const DomainAuthenticationSchema = SchemaFactory.createForClass(DomainAuthentication);
