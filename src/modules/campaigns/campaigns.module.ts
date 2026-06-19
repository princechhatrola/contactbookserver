import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailProvider, EmailProviderSchema } from './schemas/email-provider.schema';
import { SenderIdentity, SenderIdentitySchema } from './schemas/sender-identity.schema';
import { EncryptionService } from './services/encryption.service';
import { EmailProvidersService } from './services/email-providers.service';
import { SenderIdentitiesService } from './services/sender-identities.service';
import { EmailProvidersController } from './email-providers.controller';
import { SenderIdentitiesController } from './sender-identities.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailProvider.name, schema: EmailProviderSchema },
      { name: SenderIdentity.name, schema: SenderIdentitySchema },
    ]),
  ],
  controllers: [EmailProvidersController, SenderIdentitiesController],
  providers: [EncryptionService, EmailProvidersService, SenderIdentitiesService],
  exports: [MongooseModule, EncryptionService, EmailProvidersService, SenderIdentitiesService],
})
export class CampaignsModule {}
