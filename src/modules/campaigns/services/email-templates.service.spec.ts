import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplate } from '../schemas/email-template.schema';
import { EmailProvidersService } from './email-providers.service';
import { SenderIdentitiesService } from './sender-identities.service';
import { StorageService } from '../../storage/storage.service';

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
  static findByIdAndUpdate = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(mockTemplate),
  });
}

describe('EmailTemplatesService', () => {
  let service: EmailTemplatesService;
  let model: any;
  let providersService: any;
  let sendersService: any;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        {
          provide: getModelToken(EmailTemplate.name),
          useValue: MockEmailTemplateModel,
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn().mockResolvedValue(undefined),
            deleteFile: jest.fn().mockResolvedValue(undefined),
          },
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
            findOne: jest.fn().mockResolvedValue({
              _id: '60c72b2f9b1d8b2a3c8d1055',
              type: 'smtp',
            }),
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
            findOne: jest.fn().mockResolvedValue({
              _id: '60c72b2f9b1d8b2a3c8d1077',
              email: 'sales@company.com',
              name: 'Sales Team',
            }),
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

  describe('Email Template Attachments', () => {
    it('should successfully add attachment details to template record', async () => {
      const mockFile: any = {
        originalname: 'test_doc.pdf',
        mimetype: 'application/pdf',
        path: '/tmp/test_doc.pdf',
        size: 200,
      };

      const mockStorage = module.get<StorageService>(StorageService);
      const uploadSpy = jest.spyOn(mockStorage, 'uploadFile').mockResolvedValue(undefined);

      jest.spyOn(model, 'findByIdAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTemplate,
          attachments: [
            {
              filename: 'test_doc.pdf',
              path: 'templates/60c72b2f9b1d8b2a3c8d1099/attachments/...',
              mimetype: 'application/pdf',
              size: 200,
            },
          ],
        }),
      } as any);

      const result = await service.addAttachment(
        '60c72b2f9b1d8b2a3c8d1011',
        '60c72b2f9b1d8b2a3c8d1099',
        mockFile,
      );

      expect(result.attachments).toBeDefined();
      expect(result.attachments![0]!.filename).toBe('test_doc.pdf');
      expect(uploadSpy).toHaveBeenCalled();
    });

    it('should remove attachment details and purge it from storage', async () => {
      const mockTemplateWithAttachments = {
        ...mockTemplate,
        attachments: [
          {
            filename: 'test_doc.pdf',
            path: 'templates/60c72b2f9b1d8b2a3c8d1099/attachments/test_doc.pdf',
            mimetype: 'application/pdf',
            size: 200,
          },
        ],
      };

      jest.spyOn(model, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTemplateWithAttachments),
      } as any);

      const mockStorage = module.get<StorageService>(StorageService);
      const deleteSpy = jest.spyOn(mockStorage, 'deleteFile').mockResolvedValue(undefined);

      jest.spyOn(model, 'findByIdAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTemplate,
          attachments: [],
        }),
      } as any);

      const result = await service.removeAttachment(
        '60c72b2f9b1d8b2a3c8d1011',
        '60c72b2f9b1d8b2a3c8d1099',
        'test_doc.pdf',
      );

      expect(result.attachments).toEqual([]);
      expect(deleteSpy).toHaveBeenCalled();
    });
  });

  describe('generateHtml', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should throw BadRequestException if LLM_API_KEY is not defined', async () => {
      delete process.env.LLM_API_KEY;

      await expect(
        service.generateHtml({ prompt: 'test prompt' })
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully make a request to the resolved endpoint, strip <think> blocks and return cleaned HTML', async () => {
      process.env.LLM_API_KEY = 'test_key';
      process.env.LLM_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

      const mockResponse = {
        choices: [
          {
            message: {
              content: '<think>\nSome thoughts here...\n</think>\n```html\n<div>Hello World</div>\n```',
            },
          },
        ],
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });
      global.fetch = fetchMock;

      const result = await service.generateHtml({
        prompt: 'test prompt',
        subject: 'test subject',
        currentHtml: '<div>Current</div>',
      });

      expect(result.html).toBe('<div>Hello World</div>');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test_key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should automatically append x-rotation-strategy headers for serverllm.umanginfo.me', async () => {
      process.env.LLM_API_KEY = 'test_key';
      process.env.LLM_ENDPOINT = 'https://serverllm.umanginfo.me/api/v1/proxy/chat/completions';

      const mockResponse = {
        choices: [
          {
            message: {
              content: '<div>Proxy OK</div>',
            },
          },
        ],
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });
      global.fetch = fetchMock;

      const result = await service.generateHtml({ prompt: 'test prompt' });

      expect(result.html).toBe('<div>Proxy OK</div>');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://serverllm.umanginfo.me/api/v1/proxy/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-rotation-strategy': 'priority',
          }),
        })
      );
    });

    it('should fall back to Gemini OpenAI endpoint if key starts with AIzaSy and no endpoint provided', async () => {
      process.env.LLM_API_KEY = 'AIzaSyTestKey';
      delete process.env.LLM_ENDPOINT;
      delete process.env.LLM_MODEL;

      const mockResponse = {
        choices: [
          {
            message: {
              content: '<html>Hello Gemini</html>',
            },
          },
        ],
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });
      global.fetch = fetchMock;

      const result = await service.generateHtml({ prompt: 'test prompt' });

      expect(result.html).toBe('<html>Hello Gemini</html>');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        expect.any(Object)
      );
    });
  });
});
