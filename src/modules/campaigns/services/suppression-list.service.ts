import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseTenantRepository } from '../../../common/repositories/base-tenant.repository';
import { SuppressionList, SuppressionListDocument, SuppressionReason } from '../schemas/suppression-list.schema';
import { CreateSuppressionDto } from '../dto/create-suppression.dto';

@Injectable()
export class SuppressionListService extends BaseTenantRepository<SuppressionListDocument> {
  private readonly logger = new Logger(SuppressionListService.name);

  constructor(
    @InjectModel(SuppressionList.name)
    private readonly suppressionModel: Model<SuppressionListDocument>,
  ) {
    super(suppressionModel);
  }

  /**
   * Adds or updates an email in the suppression list for a specific organization.
   */
  async add(orgId: string, dto: CreateSuppressionDto): Promise<SuppressionListDocument> {
    const email = dto.email.trim().toLowerCase();
    const organizationId = new Types.ObjectId(orgId);

    const doc = await this.suppressionModel.findOneAndUpdate(
      { organizationId, email },
      { reason: dto.reason },
      { upsert: true, new: true }
    ).exec();

    this.logger.log(`Email ${email} added to suppression list for organization ${orgId} with reason ${dto.reason}`);
    return doc;
  }

  /**
   * Removes an email from the suppression list.
   */
  async removeEmail(orgId: string, email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await this.suppressionModel.deleteOne(
      this.getScopedFilter(orgId, { email: normalizedEmail } as any)
    ).exec();

    if (result.deletedCount === 0) {
      throw new BadRequestException(`Email ${email} is not in the suppression list`);
    }

    this.logger.log(`Email ${normalizedEmail} removed from suppression list for organization ${orgId}`);
  }

  /**
   * Checks if a single email is suppressed.
   */
  async isSuppressed(orgId: string, email: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();
    const count = await this.suppressionModel.countDocuments(
      this.getScopedFilter(orgId, { email: normalizedEmail } as any)
    ).exec();
    return count > 0;
  }

  /**
   * Filters a list of emails, returning only the subset of emails that are suppressed.
   */
  async filterSuppressed(orgId: string, emails: string[]): Promise<Set<string>> {
    if (!emails || emails.length === 0) {
      return new Set<string>();
    }

    const normalizedEmails = emails.map(e => e.trim().toLowerCase());
    const records = await this.suppressionModel.find(
      this.getScopedFilter(orgId, { email: { $in: normalizedEmails } } as any),
      { email: 1 }
    ).exec();

    return new Set<string>(records.map(r => r.email));
  }

  /**
   * Gets a paginated list of suppressed emails, optionally matching a search query.
   */
  async getSuppressed(
    orgId: string,
    query: { search?: string; page?: number; limit?: number }
  ): Promise<{ data: SuppressionListDocument[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit || 10)));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.search) {
      filter.email = { $regex: query.search.trim(), $options: 'i' };
    }

    const scopedFilter = this.getScopedFilter(orgId, filter);

    const [data, total] = await Promise.all([
      this.suppressionModel
        .find(scopedFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.suppressionModel.countDocuments(scopedFilter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }
}
