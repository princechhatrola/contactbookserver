import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailProvidersService } from './email-providers.service';
import { EmailProvider, ProviderType, ProviderStatus } from '../schemas/email-provider.schema';
import { EncryptionService } from './encryption.service';

const mockEmailProvider = {
  _id: '60c72b2f9b1d8b2a3c8d1055',
  organizationId: '60c72b2f9b1d8b2a3c8d1011',
  name: 'SMTP Service',
  type: ProviderType.SMTP,
  credentials: 'encrypted_string',
  status: ProviderStatus.ACTIVE,
  priority: 1,
  toObject: jest.fn().mockReturnValue({
    _id: '60c72b2f9b1d8b2a3c8d1055',
    organizationId: '60c72b2f9b1d8b2a3c8d1011',
    name: 'SMTP Service',
    type: ProviderType.SMTP,
    credentials: 'encrypted_string',
    status: ProviderStatus.ACTIVE,
    priority: 1,
  }),
};

class MockEmailProviderModel {
  constructor(private data: any) {
    Object.assign(this, data);
  }
  save = jest.fn().mockResolvedValue(mockEmailProvider);
  static find = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue([mockEmailProvider]),
  });
  static findOne = jest.fn();
  static findOneAndUpdate = jest.fn();
  static updateOne = jest.fn();
}

describe('EmailProvidersService', () => {
  let service: EmailProvidersService;
  let model: any;
  let encryptionService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProvidersService,
        {
          provide: getModelToken(EmailProvider.name),
          useValue: MockEmailProviderModel,
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn().mockReturnValue('encrypted_string'),
            decrypt: jest.fn().mockReturnValue(JSON.stringify({ apiKey: 'mock_test_key' })),
          },
        },
      ],
    }).compile();

    service = module.get<EmailProvidersService>(EmailProvidersService);
    model = module.get(getModelToken(EmailProvider.name));
    encryptionService = module.get(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createProvider', () => {
    it('should successfully create email provider when connection test passes', async () => {
      const dto = {
        name: 'SMTP Service',
        type: ProviderType.SMTP,
        credentials: { apiKey: 'mock_test_key' },
      };

      const result = await service.createProvider('60c72b2f9b1d8b2a3c8d1011', dto);
      expect(result).toBeDefined();
      expect(encryptionService.encrypt).toHaveBeenCalled();
    });

    it('should throw BadRequestException when connection test fails', async () => {
      const dto = {
        name: 'SMTP Service',
        type: ProviderType.SMTP,
        credentials: { apiKey: 'invalid_key', port: 587, host: 'invalid' },
      };

      await expect(service.createProvider('60c72b2f9b1d8b2a3c8d1011', dto)).rejects.toThrow(BadRequestException);
    });
  });
});
