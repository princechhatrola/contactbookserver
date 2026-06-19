import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CampaignsService } from './campaigns.service';
import { Campaign } from '../schemas/campaign.schema';
import { CampaignRecipient } from '../schemas/campaign-recipient.schema';
import { AudienceCompilerService } from './audience-compiler.service';
import { AuditLogEmitter } from '../../audit-logs/audit-log-emitter';

const mockCampaign = {
  _id: new Types.ObjectId('60c72b2f9b1d8e2b8c8d8888'),
  organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
  name: 'Q3 Newsletter',
  subject: 'Latest Product Updates',
  emailTemplateId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1022'),
  emailProviderId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1033'),
  senderIdentityId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1044'),
  segmentFilters: { groupIds: ['60c72b2f9b1d8b2a3c8d1055'] },
  status: 'draft',
  totalRecipients: 0,
  sentRecipients: 0,
  failedRecipients: 0,
  createdById: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1066'),
  isDeleted: false,
  save: jest.fn(),
};

class MockCampaignModel {
  constructor(private data: any) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  }
  static findOne = jest.fn();
  static find = jest.fn();
  static countDocuments = jest.fn();
  static findOneAndUpdate = jest.fn();
  static updateOne = jest.fn();
  static create = jest.fn();
}

class MockRecipientModel {}

const mockAudienceCompiler = {
  getSegmentPreview: jest.fn(),
};

const mockAuditLogEmitter = {
  emit: jest.fn(),
};

describe('CampaignsService', () => {
  let service: CampaignsService;
  let campaignModel: any;
  let audienceCompiler: any;
  let auditLogEmitter: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        {
          provide: getModelToken(Campaign.name),
          useValue: MockCampaignModel,
        },
        {
          provide: getModelToken(CampaignRecipient.name),
          useValue: MockRecipientModel,
        },
        {
          provide: AudienceCompilerService,
          useValue: mockAudienceCompiler,
        },
        {
          provide: AuditLogEmitter,
          useValue: mockAuditLogEmitter,
        },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
    campaignModel = module.get(getModelToken(Campaign.name));
    audienceCompiler = module.get(AudienceCompilerService);
    auditLogEmitter = module.get(AuditLogEmitter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCampaign', () => {
    it('should successfully create campaign as draft', async () => {
      const dto = {
        name: 'Q3 Newsletter',
        subject: 'Latest Product Updates',
        emailTemplateId: '60c72b2f9b1d8b2a3c8d1022',
        emailProviderId: '60c72b2f9b1d8b2a3c8d1033',
        senderIdentityId: '60c72b2f9b1d8b2a3c8d1044',
        segmentFilters: { groupIds: ['60c72b2f9b1d8b2a3c8d1055'] },
      };

      // Mock creation via base repository create (instantiates class then saves)
      const instance = new MockCampaignModel({
        ...dto,
        organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
        status: 'draft',
        totalRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
        createdById: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1066'),
        isDeleted: false,
      });

      // Inject the mock save
      jest.spyOn(service, 'create').mockResolvedValue(instance as any);

      const result = await service.createCampaign(
        '60c72b2f9b1d8b2a3c8d1011',
        '60c72b2f9b1d8b2a3c8d1066',
        dto,
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
      expect(auditLogEmitter.emit).toHaveBeenCalledWith('audit.log', expect.any(Object));
    });
  });

  describe('getCampaign', () => {
    it('should return campaign detail if found', async () => {
      campaignModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockCampaign),
      });

      const result = await service.getCampaign(
        '60c72b2f9b1d8b2a3c8d1011',
        '60c72b2f9b1d8e2b8c8d8888',
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('Q3 Newsletter');
    });

    it('should throw NotFoundException if not found', async () => {
      campaignModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getCampaign('60c72b2f9b1d8b2a3c8d1011', 'missingid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCampaign', () => {
    it('should throw BadRequestException if campaign is not in draft or paused', async () => {
      const activeCampaign = { ...mockCampaign, status: 'sending' };
      campaignModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(activeCampaign),
      });

      await expect(
        service.updateCampaign('60c72b2f9b1d8b2a3c8d1011', '60c72b2f9b1d8e2b8c8d8888', {
          name: 'Updated Name',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('scheduleCampaign', () => {
    it('should calculate recipients and set scheduled status', async () => {
      const targetCampaign = {
        ...mockCampaign,
        status: 'draft',
        save: jest.fn().mockResolvedValue(true),
      };

      campaignModel.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(targetCampaign),
      });

      audienceCompiler.getSegmentPreview.mockResolvedValue({
        totalMatched: 10,
        suppressedCount: 2,
        cleanCount: 8,
      });

      const result = await service.scheduleCampaign(
        '60c72b2f9b1d8b2a3c8d1011',
        '60c72b2f9b1d8e2b8c8d8888',
        '2026-06-19T10:00:00.000Z',
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('scheduled');
      expect(result.totalRecipients).toBe(8);
      expect(targetCampaign.save).toHaveBeenCalled();
    });
  });
});
