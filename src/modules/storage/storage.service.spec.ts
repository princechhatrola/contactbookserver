import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import * as fs from 'fs';
import * as path from 'path';

describe('StorageService', () => {
  let service: StorageService;
  let configService: ConfigService;

  const mockConfigValues: Record<string, string | undefined> = {
    AWS_ACCESS_KEY_ID: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    AWS_S3_BUCKET: undefined,
    AWS_REGION: 'us-east-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              return mockConfigValues[key] !== undefined ? mockConfigValues[key] : defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    configService = module.get<ConfigService>(ConfigService);
    service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fall back to local storage when S3 configuration is incomplete', () => {
    const loggerSpy = jest.spyOn((service as any).logger, 'warn');
    service.onModuleInit();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('AWS S3 configuration is incomplete. Falling back to local filesystem storage.'),
    );
  });

  describe('Local Storage Fallback Operations', () => {
    const testTempDir = path.join(process.cwd(), 'uploads', 'test-temp');
    const testFile = path.join(testTempDir, 'source.txt');
    const testKey = 'test-temp/copied.txt';
    const destinationFile = path.join(testTempDir, 'destination.txt');

    beforeAll(() => {
      if (!fs.existsSync(testTempDir)) {
        fs.mkdirSync(testTempDir, { recursive: true });
      }
    });

    afterAll(() => {
      // Cleanup all files
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      if (fs.existsSync(destinationFile)) fs.unlinkSync(destinationFile);
      const copiedFile = path.join(process.cwd(), 'uploads', testKey);
      if (fs.existsSync(copiedFile)) fs.unlinkSync(copiedFile);
      if (fs.existsSync(testTempDir)) {
        try {
          fs.rmdirSync(testTempDir);
        } catch (_) {}
      }
    });

    it('should upload (copy) a file to local fallback storage and verify its existence', async () => {
      fs.writeFileSync(testFile, 'Hello Fallback S3!', 'utf-8');

      // Upload file
      const key = await service.uploadFile(testFile, testKey);
      expect(key).toBe(testKey);

      // Verify file exists
      const exists = await service.exists(testKey);
      expect(exists).toBe(true);
    });

    it('should download (copy back) the uploaded file', async () => {
      await service.downloadFile(testKey, destinationFile);
      expect(fs.existsSync(destinationFile)).toBe(true);
      expect(fs.readFileSync(destinationFile, 'utf-8')).toBe('Hello Fallback S3!');
    });

    it('should stream the file contents', async () => {
      const stream = await service.getObjectStream(testKey);
      expect(stream).toBeDefined();

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      const fileContent = Buffer.concat(chunks).toString('utf-8');
      expect(fileContent).toBe('Hello Fallback S3!');
    });

    it('should delete the uploaded file', async () => {
      await service.deleteFile(testKey);
      const exists = await service.exists(testKey);
      expect(exists).toBe(false);
    });
  });
});
