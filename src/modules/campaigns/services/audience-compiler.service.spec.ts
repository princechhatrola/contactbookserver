import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AudienceCompilerService } from './audience-compiler.service';
import { SuppressionListService } from './suppression-list.service';
import { Contact } from '../../contacts/schemas/contact.schema';
import { Lead } from '../../leads/schemas/lead.schema';

const mockContactList = [
  {
    _id: '60c72b2f9b1d8b2a3c8d1001',
    organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    groups: [new Types.ObjectId('60c72b2f9b1d8b2a3c8d1055')],
    tags: ['newsletter'],
    customFields: new Map([['tier', 'VIP']]),
  },
  {
    _id: '60c72b2f9b1d8b2a3c8d1002',
    organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
    firstName: 'Bob',
    lastName: 'Jones',
    email: 'bob@example.com',
    groups: [],
    tags: ['promo'],
    customFields: new Map([['tier', 'Standard']]),
  },
];

class MockContactModel {
  static find = jest.fn();
}

class MockLeadModel {
  static find = jest.fn();
}

describe('AudienceCompilerService', () => {
  let service: AudienceCompilerService;
  let contactModel: any;
  let leadModel: any;
  let suppressionService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudienceCompilerService,
        {
          provide: getModelToken(Contact.name),
          useValue: MockContactModel,
        },
        {
          provide: getModelToken(Lead.name),
          useValue: MockLeadModel,
        },
        {
          provide: SuppressionListService,
          useValue: {
            filterSuppressed: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AudienceCompilerService>(AudienceCompilerService);
    contactModel = module.get(getModelToken(Contact.name));
    leadModel = module.get(getModelToken(Lead.name));
    suppressionService = module.get(SuppressionListService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSegmentPreview', () => {
    it('should build filter and check suppression counts', async () => {
      contactModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockContactList),
      });
      suppressionService.filterSuppressed.mockResolvedValue(new Set(['bob@example.com']));

      const dto = {
        groupIds: ['60c72b2f9b1d8b2a3c8d1055'],
        tags: ['newsletter'],
        customFields: { tier: 'VIP' },
      };

      const result = await service.getSegmentPreview('60c72b2f9b1d8b2a3c8d1011', dto);

      expect(result).toBeDefined();
      expect(result.totalMatched).toBe(2);
      expect(result.suppressedCount).toBe(1);
      expect(result.cleanCount).toBe(1);

      expect(contactModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
          groups: { $in: [new Types.ObjectId('60c72b2f9b1d8b2a3c8d1055')] },
          tags: { $in: ['newsletter'] },
          'customFields.tier': 'VIP',
        }),
        { email: 1 }
      );
    });

    it('should query leads and resolve contact ids if leadStatuses is provided', async () => {
      leadModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ contactId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1001') }]),
      });
      contactModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockContactList[0]]),
      });
      suppressionService.filterSuppressed.mockResolvedValue(new Set());

      const dto = {
        leadStatuses: ['New', 'Contacted'],
      };

      const result = await service.getSegmentPreview('60c72b2f9b1d8b2a3c8d1011', dto);

      expect(result.totalMatched).toBe(1);
      expect(leadModel.find).toHaveBeenCalledWith(
        {
          organizationId: new Types.ObjectId('60c72b2f9b1d8b2a3c8d1011'),
          status: { $in: ['New', 'Contacted'] },
        },
        { contactId: 1 }
      );
      expect(contactModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: [new Types.ObjectId('60c72b2f9b1d8b2a3c8d1001')] },
        }),
        { email: 1 }
      );
    });
  });

  describe('compileSegment', () => {
    it('should return clean contacts omitting suppressed ones', async () => {
      contactModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockContactList),
      });
      suppressionService.filterSuppressed.mockResolvedValue(new Set(['alice@example.com']));

      const result = await service.compileSegment('60c72b2f9b1d8b2a3c8d1011', {});

      expect(result.length).toBe(1);
      expect(result[0]?.email).toBe('bob@example.com');
    });
  });
});
