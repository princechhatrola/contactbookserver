import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('EMAIL_CREDENTIALS_ENCRYPTION_KEY');
    if (!rawKey) {
      const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
      if (isProduction) {
        throw new Error('EMAIL_CREDENTIALS_ENCRYPTION_KEY is required in production!');
      }
      // Fallback key for local development
      this.key = crypto.createHash('sha256').update('fallback-dev-key-do-not-use-in-prod').digest();
    } else {
      if (rawKey.length === 64) {
        this.key = Buffer.from(rawKey, 'hex');
      } else {
        this.key = crypto.createHash('sha256').update(rawKey).digest();
      }
    }
  }

  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      return `${iv.toString('hex')}:${encrypted}:${authTag}`;
    } catch (error: any) {
      throw new InternalServerErrorException('Failed to encrypt credentials');
    }
  }

  decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format');
      }
      const iv = Buffer.from(parts[0]!, 'hex');
      const encrypted = parts[1]!;
      const authTag = Buffer.from(parts[2]!, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error: any) {
      throw new InternalServerErrorException('Failed to decrypt credentials. Check encryption key.');
    }
  }
}
