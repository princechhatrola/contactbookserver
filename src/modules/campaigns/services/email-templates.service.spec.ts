import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplate } from '../schemas/email-template.schema';
import { EmailProvidersService } from './email-providers.service';
import { SenderIdentitiesService } from './sender-identities.service';

const mockTemplate: any = {
  _id: '60c72b2f9b1d8b2a3c8d1099',
  organizationId: '60c72b2f9b1d8b2a3c8d1011',
  name: 'Welcome Template',
  subject: 'Hello {{firstName}}!',
  htmlContent: '<p>Hi {{firstName}} {{lastName}}, welcome to {{company}}!</p><p>Age: {{customFields.age}}</p>',
  variables: ['firstName', 'lastName', 'company', 'customFields.age'],
  isDeleted: false,
};
mockTemplate.toObject = jest.fn().mockImplementation(() => ({ ...mockTemplate }));
mockTemplate.save = jest.fn().mockResolvedValue(mockTemplate);

class MockEmailTemplateModel {
  constructor(private data: any) {
    Object.assign(this, data);
  }
  save = jest.fn().mockResolvedValue(mockTemplate);
  static find = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue([mockTemplate]),
  });
  static findOne = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(mockTemplate),
  });
  static findOneAndUpdate = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(mockTemplate),
  });
  static updateOne = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  });
}

describe('EmailTemplatesService', () => {
  let service: EmailTemplatesService;
  let model: any;
  let providersService: any;
  let sendersService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        {
          provide: getModelToken(EmailTemplate.name),
          useValue: MockEmailTemplateModel,
        },
        {
          provide: EmailProvidersService,
          useValue: {
            emailProviderModel: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                  _id: '60c72b2f9b1d8b2a3c8d1055',
                  type: 'smtp',
                }),
              }),
            },
            getDecryptedCredentials: jest.fn().mockReturnValue({
              apiKey: 'mock_test_key',
            }),
          },
        },
        {
          provide: SenderIdentitiesService,
          useValue: {
            senderIdentityModel: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                  _id: '60c72b2f9b1d8b2a3c8d1077',
                  email: 'sales@company.com',
                  name: 'Sales Team',
                }),
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<EmailTemplatesService>(EmailTemplatesService);
    model = module.get(getModelToken(EmailTemplate.name));
    providersService = module.get(EmailProvidersService);
    sendersService = module.get(SenderIdentitiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractVariables', () => {
    it('should extract unique placeholders from html and subject', () => {
      const html = '<p>Hello {{firstName}}, your code is {{code}}.</p>';
      const subject = 'Alert for {{firstName}} ({{id}})';
      const result = service.extractVariables(html, subject);

      expect(result).toContain('firstName');
      expect(result).toContain('code');
      expect(result).toContain('id');
      expect(result.length).toBe(3);
    });
  });

  describe('compile', () => {
    it('should replace placeholders with correct values from object', () => {
      const html = 'Hi {{firstName}} {{lastName}} at {{company}}! Custom: {{customFields.tier}}';
      const contact = {
        firstName: 'Umang',
        lastName: 'Talpara',
        company: 'ProvenPeak',
        customFields: {
          tier: 'Gold',
        },
      };

      const result = service.compile(html, contact);
      expect(result).toBe('Hi Umang Talpara at ProvenPeak! Custom: Gold');
    });

    it('should resolve empty string for missing variables', () => {
      const html = 'Hi {{firstName}} {{middleName}} {{lastName}}!';
      const contact = {
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = service.compile(html, contact);
      expect(result).toBe('Hi John  Doe!');
    });
  });

  describe('createTemplate', () => {
    it('should successfully parse variables and create template record', async () => {
      const dto = {
        name: 'Welcome Template',
        subject: 'Hello {{firstName}}!',
        htmlContent: '<p>Hi {{firstName}} {{lastName}}!</p>',
      };

      const result = await service.createTemplate(
        '60c72b2f9b1d8b2a3c8d1011',
        '60c72b2f9b1d8b2a3c8d1022',
        dto,
      );

      expect(result).toBeDefined();
      expect(result.variables).toContain('firstName');
    });
  });

  describe('sendTestEmail', () => {
    it('should compile templates and trigger sending relay successfully', async () => {
      const dto = {
        recipientEmail: 'test@recipient.com',
        emailProviderId: '60c72b2f9b1d8b2a3c8d1055',
        senderIdentityId: '60c72b2f9b1d8b2a3c8d1077',
      };

      await expect(
        service.sendTestEmail('60c72b2f9b1d8b2a3c8d1011', '60c72b2f9b1d8b2a3c8d1099', dto),
      ).resolves.not.toThrow();

      expect(providersService.getDecryptedCredentials).toHaveBeenCalled();
    });
  });
});
