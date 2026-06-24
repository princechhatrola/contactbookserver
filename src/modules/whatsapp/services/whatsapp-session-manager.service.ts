import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
// Baileys types are not statically imported to prevent TS from generating a require() call for the ESM package.
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { WhatsappProvider, WhatsappProviderDocument, WhatsappProviderStatus } from '../schemas/whatsapp-provider.schema';
import { WhatsappSession, WhatsappSessionDocument } from '../schemas/whatsapp-session.schema';

@Injectable()
export class WhatsappSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappSessionManager.name);
  private sockets = new Map<string, any>(); // Map of providerId -> socket instance
  private baileys: any = null; // Loaded dynamically to prevent require() of ES Module errors

  constructor(
    @InjectModel(WhatsappProvider.name)
    private readonly providerModel: Model<WhatsappProviderDocument>,
    @InjectModel(WhatsappSession.name)
    private readonly sessionModel: Model<WhatsappSessionDocument>,
  ) {}

  async onModuleInit() {
    try {
      // Bypasses CommonJS require() transpilation of import() at compile time
      this.baileys = await Function('return import("@whiskeysockets/baileys")')();

      // Auto-resume sessions that were previously connected
      const activeProviders = await this.providerModel.find({
        status: WhatsappProviderStatus.CONNECTED,
        isDeleted: { $ne: true },
      }).exec();

      this.logger.log(`Resuming ${activeProviders.length} active WhatsApp connections...`);
      for (const provider of activeProviders) {
        this.initSession(provider._id.toString()).catch((err) => {
          this.logger.error(`Failed to resume session for provider ${provider._id}: ${err.message}`);
        });
      }
    } catch (err: any) {
      this.logger.error(`Failed to load active providers on boot: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    // Gracefully disconnect all sockets
    for (const [id, socket] of this.sockets.entries()) {
      try {
        socket.ev.removeAllListeners('connection.update');
        socket.end(undefined);
      } catch (_) {}
    }
    this.sockets.clear();
  }

  async getSocket(providerId: string): Promise<any> {
    if (this.sockets.has(providerId)) {
      return this.sockets.get(providerId);
    }
    // Attempt to dynamically start the socket if it exists in DB
    const provider = await this.providerModel.findById(providerId).exec();
    if (!provider || provider.status !== WhatsappProviderStatus.CONNECTED) {
      throw new Error(`WhatsApp provider ${providerId} is not connected or verified.`);
    }
    return this.initSession(providerId);
  }

  async initSession(providerId: string): Promise<any> {
    if (this.sockets.has(providerId)) {
      return this.sockets.get(providerId);
    }

    if (!this.baileys) {
      this.baileys = await Function('return import("@whiskeysockets/baileys")')();
    }

    const authState = await this.getMongoAuthState(providerId);
    const makeWASocket = this.baileys.default || this.baileys;
    const sock = makeWASocket({
      auth: authState.state,
      logger: pino({ level: 'silent' }) as any,
      printQRInTerminal: false,
    });

    this.sockets.set(providerId, sock);

    sock.ev.on('creds.update', authState.saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Save QR code so the frontend can retrieve it
        await this.providerModel.findByIdAndUpdate(providerId, {
          status: WhatsappProviderStatus.QR_READY,
          qrCode: qr,
        });
      }

      if (connection === 'close') {
        const lastDisconnectError = lastDisconnect?.error as Boom;
        const statusCode = lastDisconnectError?.output?.statusCode;
        const shouldReconnect = statusCode !== this.baileys.DisconnectReason.loggedOut;
        
        this.logger.warn(`Connection closed for provider ${providerId}. StatusCode: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        
        this.sockets.delete(providerId);

        if (shouldReconnect) {
          // Reconnect automatically
          this.initSession(providerId);
        } else {
          // Logged out: Clear session data and mark as disconnected
          await this.sessionModel.deleteMany({ providerId }).exec();
          await this.providerModel.findByIdAndUpdate(providerId, {
            status: WhatsappProviderStatus.DISCONNECTED,
            qrCode: undefined,
            phoneNumber: undefined,
          });
        }
      } else if (connection === 'open') {
        const jid = sock.user?.id;
        const phoneNumber = jid ? jid.split(':')[0] : undefined;

        this.logger.log(`WhatsApp connection opened successfully for JID: ${jid}`);
        
        await this.providerModel.findByIdAndUpdate(providerId, {
          status: WhatsappProviderStatus.CONNECTED,
          qrCode: undefined,
          phoneNumber,
        });
      }
    });

    return sock;
  }

  // MongoDB Adapter for Baileys State Management
  private async getMongoAuthState(providerId: string) {
    if (!this.baileys) {
      this.baileys = await Function('return import("@whiskeysockets/baileys")')();
    }

    const writeData = async (data: any, key: string) => {
      const serialized = JSON.stringify(data, this.baileys.BufferJSON.replacer);
      await this.sessionModel.updateOne(
        { providerId, key },
        { data: serialized },
        { upsert: true }
      ).exec();
    };

    const readData = async (key: string) => {
      const doc = await this.sessionModel.findOne({ providerId, key }).exec();
      if (!doc) return null;
      return JSON.parse(doc.data, this.baileys.BufferJSON.reviver);
    };

    const removeData = async (key: string) => {
      await this.sessionModel.deleteOne({ providerId, key }).exec();
    };

    let creds = await readData('creds');
    if (!creds) {
      creds = this.baileys.initAuthCreds();
      await writeData(creds, 'creds');
    }

    return {
      state: {
        creds,
        keys: {
          get: async (type: string, ids: string[]) => {
            const data: { [id: string]: any } = {};
            await Promise.all(
              ids.map(async (id) => {
                let value = await readData(`${type}:${id}`);
                if (value) {
                  if (type === 'app-state-sync-key') {
                    value = this.baileys.proto.Message.AppStateSyncKeyData.fromObject(value);
                  }
                  data[id] = value;
                }
              })
            );
            return data;
          },
          set: async (data: any) => {
            const tasks: Promise<void>[] = [];
            for (const category in data) {
              for (const id in data[category]) {
                const value = data[category][id];
                const key = `${category}:${id}`;
                tasks.push(value ? writeData(value, key) : removeData(key));
              }
            }
            await Promise.all(tasks);
          },
        },
      },
      saveCreds: async () => {
        await writeData(creds, 'creds');
      },
    };
  }
}
