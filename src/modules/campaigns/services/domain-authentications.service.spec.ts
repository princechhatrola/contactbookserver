import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as dns from 'dns';
import { DomainAuthenticationsService } from './domain-authentications.service';
import { DomainAuthentication } from '../schemas/domain-authentication.schema';
import { EncryptionService } from './encryption.service';

jest.mock('dns', () => ({
  promises: {
    resolveTxt: jest.fn(),
  },
}));

const mockDomain: any = {
  _id: '60c72b2f9b1d8b2a3c8d1088',
  organizationId: '60c72b2f9b1d8b2a3c8d1011',
  domain: 'example.com',
  spfRecord: 'v=spf1 include:relay.contactflow.io ~all',
  spfVerified: false,
  dkimSelector: 'cf',
  dkimRecord: 'v=DKIM1; k=rsa; p=mock_public_key',
  dkimPrivateKey: 'encrypted_private_key',
  dkimPublicKey: 'mock_public_key',
  dkimVerified: false,
  dmarcRecord: 'v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com',
  dmarcVerified: false,
};
mockDomain.toObject = jest.fn().mockImplementation(() => ({ ...mockDomain }));
mockDomain.save = jest.fn().mockResolvedValue(mockDomain);

class MockDomainModel {
  constructor(private data: any) {
    Object.assign(this, data);
  }
  save = jest.fn().mockResolvedValue(mockDomain);
  static find = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue([mockDomain]),
  });
  static findOne = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(mockDomain),
  });
  static updateOne = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  });
}

describe('DomainAuthenticationsService', () => {
  let service: DomainAuthenticationsService;
  let model: any;
  let encryptionService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainAuthenticationsService,
        {
          provide: getModelToken(DomainAuthentication.name),
          useValue: MockDomainModel,
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn().mockReturnValue('encrypted_private_key'),
            decrypt: jest.fn().mockReturnValue('decrypted_private_key'),
          },
        },
      ],
    }).compile();

    service = module.get<DomainAuthenticationsService>(DomainAuthenticationsService);
    model = module.get(getModelToken(DomainAuthentication.name));
    encryptionService = module.get(EncryptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDomain', () => {
    it('should successfully generate keys and create a domain authentication entry', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null), // No existing domain
      });

      const result = await service.createDomain('60c72b2f9b1d8b2a3c8d1011', { domain: 'example.com' });
      
      expect(result).toBeDefined();
      expect(model.findOne).toHaveBeenCalled();
      expect(encryptionService.encrypt).toHaveBeenCalled();
    });

    it('should throw BadRequestException if domain is already registered', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDomain),
      });

      await expect(
        service.createDomain('60c72b2f9b1d8b2a3c8d1011', { domain: 'example.com' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyDomain', () => {
    it('should verify SPF, DKIM, and DMARC if all DNS records match', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDomain),
      });

      // Mock resolveTxt for:
      // 1. spf check (example.com) -> returns SPF
      // 2. dkim check (cf._domainkey.example.com) -> returns public key record
      // 3. dmarc check (_dmarc.example.com) -> returns dmarc record
      const resolveTxtMock = dns.promises.resolveTxt as jest.Mock;
      resolveTxtMock.mockImplementation((hostname: string) => {
        if (hostname === 'example.com') {
          return Promise.resolve([['v=spf1 include:relay.contactflow.io ~all']]);
        }
        if (hostname === 'cf._domainkey.example.com') {
          return Promise.resolve([['v=DKIM1; k=rsa; p=mock_public_key']]);
        }
        if (hostname === '_dmarc.example.com') {
          return Promise.resolve([['v=DMARC1; p=none']]);
        }
        return Promise.reject(new Error('DNS query failed'));
      });

      const result = await service.verifyDomain('60c72b2f9b1d8b2a3c8d1011', '60c72b2f9b1d8b2a3c8d1088');
      
      expect(result.spfVerified).toBe(true);
      expect(result.dkimVerified).toBe(true);
      expect(result.dmarcVerified).toBe(true);
      expect(mockDomain.save).toHaveBeenCalled();
    });

    it('should set verified flags to false if DNS records do not match or fail', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDomain),
      });

      // Fail all DNS resolutions
      const resolveTxtMock = dns.promises.resolveTxt as jest.Mock;
      resolveTxtMock.mockRejectedValue(new Error('ENODATA'));

      const result = await service.verifyDomain('60c72b2f9b1d8b2a3c8d1011', '60c72b2f9b1d8b2a3c8d1088');
      
      expect(result.spfVerified).toBe(false);
      expect(result.dkimVerified).toBe(false);
      expect(result.dmarcVerified).toBe(false);
      expect(mockDomain.save).toHaveBeenCalled();
    });
  });
});
