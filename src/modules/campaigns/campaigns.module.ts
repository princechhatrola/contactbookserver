import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailProvider, EmailProviderSchema } from './schemas/email-provider.schema';
import { SenderIdentity, SenderIdentitySchema } from './schemas/sender-identity.schema';
import { DomainAuthentication, DomainAuthenticationSchema } from './schemas/domain-authentication.schema';
import { EncryptionService } from './services/encryption.service';
import { EmailProvidersService } from './services/email-providers.service';
import { SenderIdentitiesService } from './services/sender-identities.service';
import { DomainAuthenticationsService } from './services/domain-authentications.service';
import { EmailProvidersController } from './email-providers.controller';
import { SenderIdentitiesController } from './sender-identities.controller';
import { DomainAuthenticationsController } from './domain-authentications.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailProvider.name, schema: EmailProviderSchema },
      { name: SenderIdentity.name, schema: SenderIdentitySchema },
      { name: DomainAuthentication.name, schema: DomainAuthenticationSchema },
    ]),
  ],
  controllers: [EmailProvidersController, SenderIdentitiesController, DomainAuthenticationsController],
  providers: [EncryptionService, EmailProvidersService, SenderIdentitiesService, DomainAuthenticationsService],
  exports: [MongooseModule, EncryptionService, EmailProvidersService, SenderIdentitiesService, DomainAuthenticationsService],
})
export class CampaignsModule {}
