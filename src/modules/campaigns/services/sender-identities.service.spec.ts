import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { SenderIdentitiesService } from './sender-identities.service';
import { SenderIdentity } from '../schemas/sender-identity.schema';
import { EmailProvider } from '../schemas/email-provider.schema';

const mockSenderIdentity: any = {
  _id: '60c72b2f9b1d8b2a3c8d1077',
  organizationId: '60c72b2f9b1d8b2a3c8d1011',
  email: 'sales@company.com',
  name: 'Sales Team',
  emailProviderId: '60c72b2f9b1d8b2a3c8d1055',
  isVerified: true,
  isDefault: false,
};
mockSenderIdentity.save = jest.fn().mockResolvedValue(mockSenderIdentity);

const mockEmailProvider = {
  _id: '60c72b2f9b1d8b2a3c8d1055',
  organizationId: '60c72b2f9b1d8b2a3c8d1011',
  name: 'SMTP Provider',
  isDeleted: false,
};

class MockSenderIdentityModel {
  constructor(private data: any) {
    Object.assign(this, data);
  }
  save = jest.fn().mockResolvedValue(mockSenderIdentity);
  static find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([mockSenderIdentity]),
  });
  static findOne = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(mockSenderIdentity),
  });
  static updateMany = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue({}),
  });
  static updateOne = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  });
}

describe('SenderIdentitiesService', () => {
  let service: SenderIdentitiesService;
  let senderModel: any;
  let providerModel: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SenderIdentitiesService,
        {
          provide: getModelToken(SenderIdentity.name),
          useValue: MockSenderIdentityModel,
        },
        {
          provide: getModelToken(EmailProvider.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SenderIdentitiesService>(SenderIdentitiesService);
    senderModel = module.get(getModelToken(SenderIdentity.name));
    providerModel = module.get(getModelToken(EmailProvider.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSender', () => {
    it('should successfully create a sender identity if provider exists', async () => {
      providerModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockEmailProvider),
      });

      const dto = {
        email: 'sales@company.com',
        name: 'Sales Team',
        emailProviderId: '60c72b2f9b1d8b2a3c8d1055',
        isDefault: true,
      };

      const result = await service.createSender('60c72b2f9b1d8b2a3c8d1011', dto);
      expect(result).toBeDefined();
      expect(providerModel.findOne).toHaveBeenCalled();
      expect(senderModel.updateMany).toHaveBeenCalled(); // Clears other defaults
    });

    it('should throw NotFoundException if provider does not exist', async () => {
      providerModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const dto = {
        email: 'sales@company.com',
        name: 'Sales Team',
        emailProviderId: '60c72b2f9b1d8b2a3c8d1099', // Valid hex string
      };

      await expect(service.createSender('60c72b2f9b1d8b2a3c8d1011', dto)).rejects.toThrow(NotFoundException);
    });
  });
});
