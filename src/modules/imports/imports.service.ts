import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ImportHistory, ImportHistoryDocument, ImportStatus } from './schemas/import-history.schema';

@Injectable()
export class ImportsService {
  constructor(
    @InjectModel(ImportHistory.name)
    private readonly importHistoryModel: Model<ImportHistoryDocument>,
    @InjectQueue('import-queue')
    private readonly importQueue: Queue,
  ) {}

  async createJob(
    orgId: string,
    userId: string,
    fileName: string,
    fileId: string,
    columnMapping: Record<string, string>,
    duplicateStrategy: 'skip' | 'overwrite',
    groupId?: string,
  ): Promise<ImportHistoryDocument> {
    const job = await this.importHistoryModel.create({
      organizationId: new Types.ObjectId(orgId),
      fileName,
      status: ImportStatus.PENDING,
      createdBy: new Types.ObjectId(userId),
      groupId: groupId ? new Types.ObjectId(groupId) : undefined,
    });

    // Add to BullMQ queue
    await this.importQueue.add('process-import', {
      jobId: job._id.toString(),
      orgId,
      userId,
      fileId,
      columnMapping,
      duplicateStrategy,
      groupId,
    });

    return job;
  }

  async getHistory(orgId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.importHistoryModel
        .find({ organizationId: new Types.ObjectId(orgId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email')
        .exec(),
      this.importHistoryModel.countDocuments({ organizationId: new Types.ObjectId(orgId) }).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getJob(orgId: string, jobId: string) {
    const job = await this.importHistoryModel.findOne({
      _id: new Types.ObjectId(jobId),
      organizationId: new Types.ObjectId(orgId),
    }).populate('createdBy', 'firstName lastName email').exec();

    if (!job) {
      throw new NotFoundException(`Import job with ID ${jobId} not found`);
    }
    return job;
  }
}
