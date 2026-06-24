import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  HeadObjectCommand 
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private bucketName: string | null = null;
  private isS3Enabled = false;
  private readonly localStorageDir = process.env.VERCEL === '1'
    ? path.join('/tmp', 'uploads')
    : path.join(process.cwd(), 'uploads');

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET') || null;
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT') || null;
    const forcePathStyle = this.configService.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true';

    if (accessKeyId && secretAccessKey && this.bucketName) {
      const clientConfig: any = {
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      };

      if (endpoint) {
        clientConfig.endpoint = endpoint;
        clientConfig.forcePathStyle = forcePathStyle;
      }

      this.s3Client = new S3Client(clientConfig);
      this.isS3Enabled = true;
      this.logger.log(`AWS S3 storage initialized successfully. Bucket: ${this.bucketName}`);
    } else {
      this.logger.warn(
        'AWS S3 configuration is incomplete. Falling back to local filesystem storage.',
      );
      if (!fs.existsSync(this.localStorageDir)) {
        fs.mkdirSync(this.localStorageDir, { recursive: true });
      }
    }
  }

  async uploadFile(localPath: string, key: string): Promise<string> {
    if (this.isS3Enabled && this.s3Client && this.bucketName) {
      try {
        const fileStream = fs.createReadStream(localPath);
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: fileStream,
          }),
        );
        this.logger.log(`Uploaded file to S3: ${key}`);
        return key;
      } catch (err: any) {
        this.logger.error(`Failed to upload file to S3: ${err.message}`);
        throw err;
      }
    } else {
      // Local fallback
      const destPath = path.join(this.localStorageDir, key);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(localPath, destPath);
      this.logger.log(`Copied file to local storage: ${key}`);
      return key;
    }
  }

  async downloadFile(key: string, localDestinationPath: string): Promise<void> {
    if (this.isS3Enabled && this.s3Client && this.bucketName) {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          }),
        );
        if (!response.Body) {
          throw new Error('Empty S3 object body');
        }
        const destDir = path.dirname(localDestinationPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        await pipeline(response.Body as Readable, fs.createWriteStream(localDestinationPath));
        this.logger.log(`Downloaded file from S3: ${key} to ${localDestinationPath}`);
      } catch (err: any) {
        this.logger.error(`Failed to download file from S3: ${err.message}`);
        throw err;
      }
    } else {
      // Local fallback
      const sourcePath = path.join(this.localStorageDir, key);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Local file not found for key: ${key}`);
      }
      const destDir = path.dirname(localDestinationPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(sourcePath, localDestinationPath);
      this.logger.log(`Copied file from local storage: ${key} to ${localDestinationPath}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    if (this.isS3Enabled && this.s3Client && this.bucketName) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          }),
        );
        this.logger.log(`Deleted file from S3: ${key}`);
      } catch (err: any) {
        this.logger.error(`Failed to delete file from S3: ${err.message}`);
      }
    } else {
      // Local fallback
      const localPath = path.join(this.localStorageDir, key);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        this.logger.log(`Deleted local storage file: ${key}`);
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this.isS3Enabled && this.s3Client && this.bucketName) {
      try {
        await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          }),
        );
        return true;
      } catch (err: any) {
        if (err.name === 'NotFound') {
          return false;
        }
        this.logger.error(`S3 HeadObject failed for key ${key}: ${err.message}`);
        return false;
      }
    } else {
      // Local fallback
      const localPath = path.join(this.localStorageDir, key);
      return fs.existsSync(localPath);
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    if (this.isS3Enabled && this.s3Client && this.bucketName) {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          }),
        );
        if (!response.Body) {
          throw new Error('S3 object body is empty');
        }
        return response.Body as Readable;
      } catch (err: any) {
        this.logger.error(`Failed to get S3 object stream for key ${key}: ${err.message}`);
        throw err;
      }
    } else {
      // Local fallback
      const localPath = path.join(this.localStorageDir, key);
      if (!fs.existsSync(localPath)) {
        throw new Error(`Local file not found for key: ${key}`);
      }
      return fs.createReadStream(localPath);
    }
  }
}
