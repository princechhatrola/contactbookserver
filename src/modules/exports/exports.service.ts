import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ExportJob, ExportJobDocument, ExportEntityType, ExportFormat, ExportStatus } from './schemas/export-job.schema';

@Injectable()
export class ExportsService {
  constructor(
    @InjectModel(ExportJob.name)
    private readonly exportJobModel: Model<ExportJobDocument>,
    @InjectQueue('export-queue')
    private readonly exportQueue: Queue,
  ) {}

  async createJob(
    orgId: string,
    userId: string,
    entityType: ExportEntityType,
    format: ExportFormat,
  ): Promise<ExportJobDocument> {
    const job = await this.exportJobModel.create({
      organizationId: new Types.ObjectId(orgId),
      entityType,
      format,
      status: ExportStatus.PENDING,
      createdBy: new Types.ObjectId(userId),
    });

    await this.exportQueue.add('process-export', {
      jobId: job._id.toString(),
      orgId,
      userId,
      entityType,
      format,
    });

    return job;
  }

  async getHistory(orgId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.exportJobModel
        .find({ organizationId: new Types.ObjectId(orgId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email')
        .exec(),
      this.exportJobModel.countDocuments({ organizationId: new Types.ObjectId(orgId) }).exec(),
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
    const job = await this.exportJobModel.findOne({
      _id: new Types.ObjectId(jobId),
      organizationId: new Types.ObjectId(orgId),
    }).populate('createdBy', 'firstName lastName email').exec();

    if (!job) {
      throw new NotFoundException(`Export job with ID ${jobId} not found`);
    }
    return job;
  }

  async findJobByFilename(orgId: string, filename: string) {
    const job = await this.exportJobModel.findOne({
      fileName: filename,
      organizationId: new Types.ObjectId(orgId),
    }).exec();
    return job;
  }
}
