import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'EMAIL_CREDENTIALS_ENCRYPTION_KEY') {
                return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
              }
              if (key === 'NODE_ENV') {
                return 'test';
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should successfully encrypt and decrypt text', () => {
    const text = JSON.stringify({ host: 'smtp.gmail.com', port: 587, user: 'test@gmail.com' });
    const encrypted = service.encrypt(text);
    
    expect(encrypted).toBeDefined();
    expect(encrypted).toContain(':');
    expect(encrypted.split(':').length).toBe(3);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it('should throw an error when decrypting invalid format', () => {
    expect(() => service.decrypt('invalid_format')).toThrow();
  });
});
