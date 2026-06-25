import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseTenantRepository } from '../../../common/repositories/base-tenant.repository';
import { WhatsappProvider, WhatsappProviderDocument, WhatsappProviderStatus } from '../schemas/whatsapp-provider.schema';
import { WhatsappSessionManager } from './whatsapp-session-manager.service';
import { WhatsappSession, WhatsappSessionDocument } from '../schemas/whatsapp-session.schema';

@Injectable()
export class WhatsappProvidersService extends BaseTenantRepository<WhatsappProviderDocument> {
  private readonly logger = new Logger(WhatsappProvidersService.name);

  constructor(
    @InjectModel(WhatsappProvider.name)
    private readonly providerModel: Model<WhatsappProviderDocument>,
    @InjectModel(WhatsappSession.name)
    private readonly sessionModel: Model<WhatsappSessionDocument>,
    private readonly sessionManager: WhatsappSessionManager,
  ) {
    super(providerModel);
  }

  async createProvider(orgId: string, name: string): Promise<WhatsappProviderDocument> {
    const providerData = {
      organizationId: new Types.ObjectId(orgId),
      name: name.trim(),
      status: WhatsappProviderStatus.DISCONNECTED,
    };
    return this.create(orgId, providerData as any);
  }

  async getProviders(orgId: string): Promise<WhatsappProviderDocument[]> {
    return this.find(orgId, { isDeleted: { $ne: true } });
  }

  async getProvider(orgId: string, providerId: string): Promise<WhatsappProviderDocument> {
    const provider = await this.providerModel.findOne(
      this.getScopedFilter(orgId, { _id: providerId, isDeleted: { $ne: true } } as any)
    ).exec();

    if (!provider) {
      throw new NotFoundException(`WhatsApp account with ID ${providerId} not found`);
    }

    return provider;
  }

  async connectProvider(orgId: string, providerId: string): Promise<void> {
    const provider = await this.getProvider(orgId, providerId);
    
    // Set state to connecting and spawn connection in background
    provider.status = WhatsappProviderStatus.CONNECTING;
    provider.qrCode = undefined;
    await provider.save();

    // Spawn session creation (async)
    this.sessionManager.initSession(providerId).catch((err) => {
      this.logger.error(`Failed to initialize session for provider ${providerId}: ${err.message}`);
    });
  }

  async deleteProvider(orgId: string, providerId: string): Promise<void> {
    const result = await this.providerModel.updateOne(
      this.getScopedFilter(orgId, { _id: providerId, isDeleted: { $ne: true } } as any),
      { isDeleted: true, status: WhatsappProviderStatus.DISCONNECTED }
    ).exec();

    if (result.modifiedCount === 0) {
      throw new NotFoundException(`WhatsApp account with ID ${providerId} not found`);
    }

    // Clean up session records in DB
    await this.sessionModel.deleteMany({ providerId }).exec();
  }

  async updatePriority(orgId: string, providerId: string, priority: number): Promise<WhatsappProviderDocument> {
    const updated = await this.providerModel.findOneAndUpdate(
      this.getScopedFilter(orgId, { _id: providerId, isDeleted: { $ne: true } } as any),
      { priority },
      { new: true }
    ).exec();

    if (!updated) {
      throw new NotFoundException(`WhatsApp account with ID ${providerId} not found`);
    }

    return updated;
  }

  async sendTestMessage(orgId: string, providerId: string, phoneNumber: string): Promise<{ success: boolean; messageId: string }> {
    const provider = await this.getProvider(orgId, providerId);
    
    if (provider.status !== WhatsappProviderStatus.CONNECTED) {
      throw new BadRequestException(`WhatsApp provider is not connected. Current status: ${provider.status}`);
    }

    try {
      const socket = await this.sessionManager.getSocket(providerId);
      if (!socket) {
        throw new Error('Failed to retrieve active socket session');
      }

      const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
      const jid = `${cleanPhone}@s.whatsapp.net`;
      
      const messageText = `Hello! This is a test message from your ContactFlow SaaS connection: *${provider.name}*. Connection is verified successfully!`;
      
      // Simulating a minor typing composer update
      await socket.sendPresenceUpdate('composing', jid);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const response = await socket.sendMessage(jid, { text: messageText });
      
      return { 
        success: true, 
        messageId: response?.key?.id || 'unknown' 
      };
    } catch (err: any) {
      this.logger.error(`Failed to send test message from provider ${providerId}: ${err.message}`);
      throw new BadRequestException(`Failed to send test message: ${err.message}`);
    }
  }
}
