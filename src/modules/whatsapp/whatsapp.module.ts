import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { WhatsappProvider, WhatsappProviderSchema } from './schemas/whatsapp-provider.schema';
import { WhatsappSession, WhatsappSessionSchema } from './schemas/whatsapp-session.schema';
import { WhatsappCampaign, WhatsappCampaignSchema } from './schemas/whatsapp-campaign.schema';
import { WhatsappCampaignRecipient, WhatsappCampaignRecipientSchema } from './schemas/whatsapp-campaign-recipient.schema';
import { Contact, ContactSchema } from '../contacts/schemas/contact.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { WhatsappSessionManager } from './services/whatsapp-session-manager.service';
import { WhatsappProvidersService } from './services/whatsapp-providers.service';
import { WhatsappCampaignsService } from './services/whatsapp-campaigns.service';
import { WhatsappCampaignSchedulerService } from './services/whatsapp-campaign-scheduler.service';
import { WhatsappAudienceCompilerService } from './services/whatsapp-audience-compiler.service';
import { WhatsappProvidersController } from './whatsapp-providers.controller';
import { WhatsappCampaignsController } from './whatsapp-campaigns.controller';
import { WhatsappCampaignProcessor } from './processors/whatsapp-campaign.processor';
import { SendWhatsappProcessor } from './processors/send-whatsapp.processor';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsappProvider.name, schema: WhatsappProviderSchema },
      { name: WhatsappSession.name, schema: WhatsappSessionSchema },
      { name: WhatsappCampaign.name, schema: WhatsappCampaignSchema },
      { name: WhatsappCampaignRecipient.name, schema: WhatsappCampaignRecipientSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
    BullModule.registerQueue({
      name: 'whatsapp-campaign-queue',
    }),
    BullModule.registerQueue({
      name: 'send-whatsapp-queue',
    }),
    AuditLogsModule,
  ],
  controllers: [
    WhatsappProvidersController,
    WhatsappCampaignsController,
  ],
  providers: [
    WhatsappSessionManager,
    WhatsappProvidersService,
    WhatsappCampaignsService,
    WhatsappCampaignSchedulerService,
    WhatsappAudienceCompilerService,
    WhatsappCampaignProcessor,
    SendWhatsappProcessor,
  ],
  exports: [
    WhatsappSessionManager,
    WhatsappProvidersService,
    WhatsappCampaignsService,
    WhatsappAudienceCompilerService,
  ],
})
export class WhatsappModule {}
