import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { EmailProvider, EmailProviderSchema } from './schemas/email-provider.schema';
import { SenderIdentity, SenderIdentitySchema } from './schemas/sender-identity.schema';
import { DomainAuthentication, DomainAuthenticationSchema } from './schemas/domain-authentication.schema';
import { EmailTemplate, EmailTemplateSchema } from './schemas/email-template.schema';
import { SuppressionList, SuppressionListSchema } from './schemas/suppression-list.schema';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { CampaignRecipient, CampaignRecipientSchema } from './schemas/campaign-recipient.schema';
import { Contact, ContactSchema } from '../contacts/schemas/contact.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { EncryptionService } from './services/encryption.service';
import { EmailProvidersService } from './services/email-providers.service';
import { SenderIdentitiesService } from './services/sender-identities.service';
import { DomainAuthenticationsService } from './services/domain-authentications.service';
import { EmailTemplatesService } from './services/email-templates.service';
import { SuppressionListService } from './services/suppression-list.service';
import { AudienceCompilerService } from './services/audience-compiler.service';
import { CampaignsService } from './services/campaigns.service';
import { CampaignSchedulerService } from './services/campaign-scheduler.service';
import { EmailProvidersController } from './email-providers.controller';
import { SenderIdentitiesController } from './sender-identities.controller';
import { DomainAuthenticationsController } from './domain-authentications.controller';
import { EmailTemplatesController } from './email-templates.controller';
import { SuppressionListController } from './suppression-list.controller';
import { AudienceController } from './audience.controller';
import { CampaignsController } from './campaigns.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailProvider.name, schema: EmailProviderSchema },
      { name: SenderIdentity.name, schema: SenderIdentitySchema },
      { name: DomainAuthentication.name, schema: DomainAuthenticationSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: SuppressionList.name, schema: SuppressionListSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignRecipient.name, schema: CampaignRecipientSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
    BullModule.registerQueue({
      name: 'campaign-queue',
    }),
    AuditLogsModule,
  ],
  controllers: [
    EmailProvidersController, 
    SenderIdentitiesController, 
    DomainAuthenticationsController, 
    EmailTemplatesController,
    SuppressionListController,
    AudienceController,
    CampaignsController
  ],
  providers: [
    EncryptionService, 
    EmailProvidersService, 
    SenderIdentitiesService, 
    DomainAuthenticationsService, 
    EmailTemplatesService,
    SuppressionListService,
    AudienceCompilerService,
    CampaignsService,
    CampaignSchedulerService
  ],
  exports: [
    MongooseModule, 
    EncryptionService, 
    EmailProvidersService, 
    SenderIdentitiesService, 
    DomainAuthenticationsService, 
    EmailTemplatesService,
    SuppressionListService,
    AudienceCompilerService,
    CampaignsService
  ],
})
export class CampaignsModule {}

