import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyDocument } from './schemas/api-key.schema';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectModel(ApiKey.name)
    private readonly apiKeyModel: Model<ApiKeyDocument>,
  ) {}

  async generateKey(orgId: string, userId: string, name: string): Promise<{ apiKey: ApiKeyDocument; rawKey: string }> {
    // 1. Generate a cryptographically secure random key
    const rawSecret = crypto.randomBytes(24).toString('hex');
    const rawKey = `cf_live_${rawSecret}`;
    
    // 2. Hash the key using SHA-256
    const hashedKey = this.hashKey(rawKey);

    // 3. Create key preview (e.g. cf_live_xxxx...1234)
    const keyPreview = `cf_live_xxxx...${rawKey.substring(rawKey.length - 4)}`;

    // 4. Save hashed version to Database
    const apiKey = await this.apiKeyModel.create({
      organizationId: new Types.ObjectId(orgId),
      name,
      hashedKey,
      keyPreview,
      isActive: true,
      createdBy: new Types.ObjectId(userId),
    });

    return {
      apiKey,
      rawKey,
    };
  }

  async getKeys(orgId: string): Promise<ApiKeyDocument[]> {
    return this.apiKeyModel
      .find({ organizationId: new Types.ObjectId(orgId) })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName email')
      .exec();
  }

  async revokeKey(orgId: string, keyId: string): Promise<void> {
    const result = await this.apiKeyModel
      .deleteOne({ _id: new Types.ObjectId(keyId), organizationId: new Types.ObjectId(orgId) })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException(`API key with ID ${keyId} not found`);
    }
  }

  async validateKey(rawKey: string): Promise<ApiKeyDocument | null> {
    const hashedKey = this.hashKey(rawKey);
    const apiKey = await this.apiKeyModel
      .findOne({ hashedKey, isActive: true })
      .populate('createdBy')
      .exec();

    if (apiKey) {
      // Update lastUsedAt asynchronously
      this.apiKeyModel.updateOne({ _id: apiKey._id }, { $set: { lastUsedAt: new Date() } }).exec().catch(() => {});
      return apiKey;
    }

    return null;
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}
