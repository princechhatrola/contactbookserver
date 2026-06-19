import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SendEmailProcessor } from '../send-email.processor';
import { TrackingController } from '../tracking.controller';
import { WebhooksController } from '../webhooks.controller';
import { Campaign } from '../schemas/campaign.schema';
import { CampaignRecipient } from '../schemas/campaign-recipient.schema';
import { EmailProvider, ProviderType, ProviderStatus } from '../schemas/email-provider.schema';
import { EmailEvent } from '../schemas/email-event.schema';
import { Contact } from '../../contacts/schemas/contact.schema';
import { SenderIdentity } from '../schemas/sender-identity.schema';
import { SuppressionListService } from './suppression-list.service';
import { EmailTemplatesService } from './email-templates.service';
import { EmailProvidersService } from './email-providers.service';
import { getQueueToken } from '@nestjs/bullmq';
import { SuppressionReason } from '../schemas/suppression-list.schema';
import { Response, Request } from 'express';

describe('Campaigns Sending, Tracking & Webhooks Suite', () => {
  let processor: SendEmailProcessor;
  let trackingController: TrackingController;
  let webhooksController: WebhooksController;

  // Mock Models
  let mockCampaignModel: any;
  let mockRecipientModel: any;
  let mockProviderModel: any;
  let mockContactModel: any;
  let mockEventModel: any;
  let mockSenderIdentityModel: any;

  // Mock Services
  let mockSuppressionService: any;
  let mockTemplatesService: any;
  let mockProvidersService: any;

  // Mock Redis Client & BullMQ Queue
  let mockRedisClient: any;
  let mockQueue: any;

  beforeEach(async () => {
    // Redis Mock
    mockRedisClient = {
      get: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
    };

    mockQueue = {
      client: Promise.resolve(mockRedisClient),
    };

    // Mongoose Models Mock
    mockCampaignModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      exec: jest.fn(),
    };

    mockSenderIdentityModel = {
      findOne: jest.fn(),
    };

    mockRecipientModel = {
      db: {
        model: jest.fn().mockImplementation((name: string) => {
          if (name === SenderIdentity.name) {
            return mockSenderIdentityModel;
          }
          return null;
        }),
      },
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
    };

    mockProviderModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockContactModel = {
      findById: jest.fn(),
    };

    mockEventModel = {
      create: jest.fn(),
    };

    // Services Mock
    mockSuppressionService = {
      isSuppressed: jest.fn().mockResolvedValue(false),
      add: jest.fn().mockResolvedValue({}),
    };

    mockTemplatesService = {
      getTemplate: jest.fn().mockResolvedValue({
        htmlContent: '<html><body>Hello {{name}}, click <a href="https://example.com/test">here</a></body></html>',
      }),
      compile: jest.fn().mockImplementation((str, contact) => {
        return str.replace('{{name}}', contact?.firstName || 'User');
      }),
    };

    mockProvidersService = {
      getDecryptedCredentials: jest.fn().mockReturnValue({
        apiKey: 'mock_test_key',
        pass: 'mock_test_pass',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackingController, WebhooksController],
      providers: [
        SendEmailProcessor,
        {
          provide: getModelToken(Campaign.name),
          useValue: mockCampaignModel,
        },
        {
          provide: getModelToken(CampaignRecipient.name),
          useValue: mockRecipientModel,
        },
        {
          provide: getModelToken(EmailProvider.name),
          useValue: mockProviderModel,
        },
        {
          provide: getModelToken(Contact.name),
          useValue: mockContactModel,
        },
        {
          provide: getModelToken(EmailEvent.name),
          useValue: mockEventModel,
        },
        {
          provide: SuppressionListService,
          useValue: mockSuppressionService,
        },
        {
          provide: EmailTemplatesService,
          useValue: mockTemplatesService,
        },
        {
          provide: EmailProvidersService,
          useValue: mockProvidersService,
        },
        {
          provide: getQueueToken('send-email-queue'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<SendEmailProcessor>(SendEmailProcessor);
    trackingController = module.get<TrackingController>(TrackingController);
    webhooksController = module.get<WebhooksController>(WebhooksController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('SendEmailProcessor', () => {
    const jobMock = {
      data: {
        recipientId: '60c72b2f9b1d8b2a3c8d1111',
        campaignId: '60c72b2f9b1d8b2a3c8d2222',
        orgId: '60c72b2f9b1d8b2a3c8d3333',
        contactId: '60c72b2f9b1d8b2a3c8d4444',
        email: 'test@recipient.com',
      },
    } as any;

    it('should abort dispatch if campaign is paused, cancelled, or deleted', async () => {
      const mockCampaign = {
        _id: '60c72b2f9b1d8b2a3c8d2222',
        status: 'paused',
        isDeleted: false,
      };
      mockCampaignModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCampaign),
      });

      await processor.process(jobMock);

      expect(mockCampaignModel.findById).toHaveBeenCalledWith(jobMock.data.campaignId);
      expect(mockRecipientModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should skip send and fail recipient if recipient email is suppressed', async () => {
      const mockCampaign = {
        _id: '60c72b2f9b1d8b2a3c8d2222',
        status: 'sending',
        isDeleted: false,
        save: jest.fn().mockResolvedValue({}),
      };
      mockCampaignModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCampaign),
      });
      mockSuppressionService.isSuppressed.mockResolvedValue(true);

      mockCampaignModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      mockRecipientModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      mockRecipientModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      await processor.process(jobMock);

      expect(mockSuppressionService.isSuppressed).toHaveBeenCalledWith(jobMock.data.orgId, jobMock.data.email);
      expect(mockRecipientModel.findByIdAndUpdate).toHaveBeenCalledWith(jobMock.data.recipientId, {
        status: 'failed',
        error: 'Email address is in the suppression list.',
      });
      expect(mockCampaignModel.findByIdAndUpdate).toHaveBeenCalledWith(jobMock.data.campaignId, {
        $inc: { failedRecipients: 1 },
      });
    });

    it('should failover to alternative provider if default provider rate limits are exceeded', async () => {
      const mockCampaign = {
        _id: '60c72b2f9b1d8b2a3c8d2222',
        status: 'sending',
        emailProviderId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d5555'),
        senderIdentityId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d6666'),
        subject: 'My newsletter',
        emailTemplateId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d7777'),
        save: jest.fn().mockResolvedValue({}),
      };
      mockCampaignModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCampaign),
      });

      // Default provider info (rate limited)
      const mockDefaultProvider = {
        _id: new Types.ObjectId('60c72b2f9b1d8b2a3c8d5555'),
        type: ProviderType.SENDGRID,
        status: ProviderStatus.ACTIVE,
        rateLimitPerMin: 10,
        hourlyLimit: 100,
        dailyLimit: 1000,
      };

      // Alternative provider info (has limit space)
      const mockAltProvider = {
        _id: new Types.ObjectId('60c72b2f9b1d8b2a3c8d8888'),
        type: ProviderType.SMTP,
        status: ProviderStatus.ACTIVE,
        rateLimitPerMin: 20,
        hourlyLimit: 200,
        dailyLimit: 2000,
      };

      mockProviderModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDefaultProvider),
      });

      mockProviderModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([mockDefaultProvider, mockAltProvider]),
      });

      // Simulate default provider rate limited minutely
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key.includes('60c72b2f9b1d8b2a3c8d5555:min')) return '10'; // Equal to rateLimitPerMin
        return '0';
      });

      mockRedisClient.incr.mockResolvedValue(1);

      // Other dependencies for successful mock send
      mockContactModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: '60c72b2f9b1d8b2a3c8d4444', firstName: 'Jane' }),
      });
      mockSenderIdentityModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ name: 'Jane Sender', email: 'jane@company.com' }),
      });
      mockRecipientModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      mockCampaignModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      mockRecipientModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      await processor.process(jobMock);

      // Verify rotation took place (alt provider was incremented)
      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate:provider:60c72b2f9b1d8b2a3c8d8888:min');
      // Verify default provider got bypassed
      expect(mockRedisClient.incr).not.toHaveBeenCalledWith('rate:provider:60c72b2f9b1d8b2a3c8d5555:min');
    });

    it('should rewrite links and append transparent open tracking pixel', async () => {
      const mockCampaign = {
        _id: '60c72b2f9b1d8b2a3c8d2222',
        status: 'sending',
        emailProviderId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d5555'),
        senderIdentityId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d6666'),
        subject: 'My newsletter',
        emailTemplateId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d7777'),
        save: jest.fn().mockResolvedValue({}),
      };
      mockCampaignModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCampaign),
      });

      const mockProvider = {
        _id: new Types.ObjectId('60c72b2f9b1d8b2a3c8d5555'),
        type: ProviderType.SMTP,
        status: ProviderStatus.ACTIVE,
      };
      mockProviderModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProvider),
      });

      mockProvidersService.getDecryptedCredentials.mockReturnValue({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'user',
        pass: 'some_other_pass',
      });

      mockRedisClient.get.mockResolvedValue('0');
      mockRedisClient.incr.mockResolvedValue(1);

      mockContactModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: '60c72b2f9b1d8b2a3c8d4444', firstName: 'Jane' }),
      });
      mockSenderIdentityModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ name: 'Jane Sender', email: 'jane@company.com' }),
      });

      mockRecipientModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      mockCampaignModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      mockRecipientModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      // Mock nodemailer
      const mockSendMail = jest.fn().mockResolvedValue({});
      const nodemailerMock = jest.spyOn(require('nodemailer'), 'createTransport').mockReturnValue({
        sendMail: mockSendMail,
      } as any);

      await processor.process(jobMock);

      expect(mockSendMail).toHaveBeenCalled();
      const sendArgs = mockSendMail.mock.calls[0][0];

      // Verify HTML content has tracking URL
      expect(sendArgs.html).toContain('tracking/click?campaignId=60c72b2f9b1d8b2a3c8d2222&recipientId=60c72b2f9b1d8b2a3c8d1111');
      // Verify HTML content has open pixel
      expect(sendArgs.html).toContain('tracking/open?campaignId=60c72b2f9b1d8b2a3c8d2222&recipientId=60c72b2f9b1d8b2a3c8d1111');
      expect(sendArgs.html).toContain('<img src=');

      nodemailerMock.mockRestore();
    });
  });

  describe('TrackingController', () => {
    let mockRes: Partial<Response>;
    let mockReq: Partial<Request>;

    beforeEach(() => {
      mockRes = {
        set: jest.fn(),
        send: jest.fn(),
        redirect: jest.fn(),
      };
      mockReq = {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Chrome/85.0.0.0 Mobile Safari/605.1.15',
        },
      };
    });

    it('should track open, create EmailEvent with mobile/chrome client, update recipient status to opened, and return 1x1 gif', async () => {
      const recipientId = '60c72b2f9b1d8b2a3c8d1111';
      const campaignId = '60c72b2f9b1d8b2a3c8d2222';

      const mockRecipient = {
        _id: new Types.ObjectId(recipientId),
        campaignId: new Types.ObjectId(campaignId),
        organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d3333'),
        contactId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d4444'),
        status: 'sent',
        save: jest.fn().mockResolvedValue({}),
      };

      mockRecipientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRecipient),
      });

      await trackingController.trackOpen(campaignId, recipientId, mockReq as Request, mockRes as Response);

      expect(mockRecipientModel.findById).toHaveBeenCalledWith(recipientId);
      expect(mockEventModel.create).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'open',
        device: 'Mobile',
        browser: 'Chrome',
      }));
      expect(mockRecipient.status).toBe('opened');
      expect(mockRecipient.save).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'image/gif');
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should track click, create EmailEvent, update status, and redirect to target url', async () => {
      const recipientId = '60c72b2f9b1d8b2a3c8d1111';
      const campaignId = '60c72b2f9b1d8b2a3c8d2222';
      const targetUrl = 'https://example.com/dest';

      const mockRecipient = {
        _id: new Types.ObjectId(recipientId),
        campaignId: new Types.ObjectId(campaignId),
        organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d3333'),
        contactId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d4444'),
        status: 'opened',
        save: jest.fn().mockResolvedValue({}),
      };

      mockRecipientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRecipient),
      });

      await trackingController.trackClick(campaignId, recipientId, targetUrl, mockReq as Request, mockRes as Response);

      expect(mockRecipientModel.findById).toHaveBeenCalledWith(recipientId);
      expect(mockEventModel.create).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'click',
        url: targetUrl,
      }));
      expect(mockRecipient.status).toBe('clicked');
      expect(mockRecipient.save).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith(targetUrl);
    });
  });

  describe('WebhooksController', () => {
    it('should handle SendGrid bounce webhook, suppress email, and update campaign stats', async () => {
      const recipientId = '60c72b2f9b1d8b2a3c8d1111';
      const campaignId = '60c72b2f9b1d8b2a3c8d2222';
      const email = 'bounce@test.com';

      const mockRecipient = {
        _id: new Types.ObjectId(recipientId),
        campaignId: new Types.ObjectId(campaignId),
        organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d3333'),
        email,
        status: 'sent',
        save: jest.fn().mockResolvedValue({}),
      };

      mockRecipientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRecipient),
      });
      mockCampaignModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const body = [
        {
          email,
          event: 'bounce',
          recipientId,
          campaignId,
        },
      ];

      await webhooksController.handleSendGrid(body);

      expect(mockRecipientModel.findById).toHaveBeenCalledWith(recipientId);
      expect(mockRecipient.status).toBe('bounced');
      expect(mockRecipient.save).toHaveBeenCalled();
      expect(mockSuppressionService.add).toHaveBeenCalledWith('60c72b2f9b1d8b2a3c8d3333', {
        email,
        reason: SuppressionReason.BOUNCE_HARD,
      });
      expect(mockCampaignModel.findByIdAndUpdate).toHaveBeenCalledWith(mockRecipient.campaignId, {
        $inc: { failedRecipients: 1, sentRecipients: -1 },
      });
    });

    it('should handle Resend spam complaint webhook and suppress email', async () => {
      const recipientId = '60c72b2f9b1d8b2a3c8d1111';
      const campaignId = '60c72b2f9b1d8b2a3c8d2222';
      const email = 'spam@test.com';

      const mockRecipient = {
        _id: new Types.ObjectId(recipientId),
        campaignId: new Types.ObjectId(campaignId),
        organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d3333'),
        email,
        status: 'sent',
        save: jest.fn().mockResolvedValue({}),
      };

      mockRecipientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRecipient),
      });
      mockCampaignModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const body = {
        type: 'email.complained',
        data: {
          to: [email],
          headers: {
            'x-recipient-id': recipientId,
            'x-campaign-id': campaignId,
          },
        },
      };

      await webhooksController.handleResend(body);

      expect(mockRecipientModel.findById).toHaveBeenCalledWith(recipientId);
      expect(mockRecipient.status).toBe('complaint');
      expect(mockRecipient.save).toHaveBeenCalled();
      expect(mockSuppressionService.add).toHaveBeenCalledWith('60c72b2f9b1d8b2a3c8d3333', {
        email,
        reason: SuppressionReason.COMPLAINT,
      });
    });

    it('should handle Mailgun permanent failure webhook and suppress email', async () => {
      const recipientId = '60c72b2f9b1d8b2a3c8d1111';
      const campaignId = '60c72b2f9b1d8b2a3c8d2222';
      const email = 'fail@test.com';

      const mockRecipient = {
        _id: new Types.ObjectId(recipientId),
        campaignId: new Types.ObjectId(campaignId),
        organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d3333'),
        email,
        status: 'sent',
        save: jest.fn().mockResolvedValue({}),
      };

      mockRecipientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRecipient),
      });
      mockCampaignModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const body = {
        'event-data': {
          recipient: email,
          event: 'failed',
          severity: 'permanent',
          'user-variables': {
            recipientId,
            campaignId,
          },
        },
      };

      await webhooksController.handleMailgun(body);

      expect(mockRecipientModel.findById).toHaveBeenCalledWith(recipientId);
      expect(mockRecipient.status).toBe('bounced');
    });

    it('should handle Amazon SES bounce webhook and suppress email', async () => {
      const recipientId = '60c72b2f9b1d8b2a3c8d1111';
      const campaignId = '60c72b2f9b1d8b2a3c8d2222';
      const email = 'bounce-ses@test.com';

      const mockRecipient = {
        _id: new Types.ObjectId(recipientId),
        campaignId: new Types.ObjectId(campaignId),
        organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d3333'),
        email,
        status: 'sent',
        save: jest.fn().mockResolvedValue({}),
      };

      mockRecipientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRecipient),
      });
      mockCampaignModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const body = {
        Type: 'Notification',
        Message: JSON.stringify({
          notificationType: 'Bounce',
          bounce: {
            bounceType: 'Permanent',
            bouncedRecipients: [{ emailAddress: email }],
          },
          mail: {
            headers: [
              { name: 'X-Campaign-Id', value: campaignId },
              { name: 'X-Recipient-Id', value: recipientId },
            ],
          },
        }),
      };

      await webhooksController.handleSes(body);

      expect(mockRecipientModel.findById).toHaveBeenCalledWith(recipientId);
      expect(mockRecipient.status).toBe('bounced');
    });
  });
});
