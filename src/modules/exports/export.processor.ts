import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as path from 'path';
import * as fs from 'fs';
import * as xlsx from 'xlsx';
import { ExportJob, ExportJobDocument, ExportStatus, ExportEntityType, ExportFormat } from './schemas/export-job.schema';
import { Contact, ContactDocument } from '../contacts/schemas/contact.schema';
import { Lead, LeadDocument } from '../leads/schemas/lead.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { Group, GroupDocument } from '../groups/schemas/group.schema';
import { AuditLogEmitter } from '../audit-logs/audit-log-emitter';

@Processor('export-queue')
export class ExportProcessor extends WorkerHost {
  constructor(
    @InjectModel(ExportJob.name)
    private readonly exportJobModel: Model<ExportJobDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    private readonly auditLogEmitter: AuditLogEmitter,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, orgId, userId, entityType, format } = job.data;

    const exportJob = await this.exportJobModel.findById(jobId);
    if (!exportJob) {
      throw new Error(`Export job with ID ${jobId} not found`);
    }

    exportJob.status = ExportStatus.PROCESSING;
    await exportJob.save();

    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'export.started',
      description: `Bulk export started for ${entityType} in ${format} format`,
      metadata: { jobId },
    });

    // Make sure output folder exists
    const orgExportDir = path.join(process.cwd(), 'uploads', 'exports', orgId);
    if (!fs.existsSync(orgExportDir)) {
      fs.mkdirSync(orgExportDir, { recursive: true });
    }

    const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = format.toLowerCase();
    const fileName = `${entityType.toLowerCase()}-export-${uniqueId}.${extension}`;
    const filePath = path.join(orgExportDir, fileName);

    try {
      // 1. Query Data
      let records: any[] = [];
      const queryFilter = { organizationId: new Types.ObjectId(orgId) };

      if (entityType === ExportEntityType.CONTACTS) {
        const docs = await this.contactModel.find(queryFilter).exec();
        records = docs.map(doc => ({
          ID: doc._id.toString(),
          'First Name': doc.firstName || '',
          'Last Name': doc.lastName || '',
          Email: doc.email || '',
          Mobile: doc.mobile || '',
          'Alternate Mobile': doc.alternateMobile || '',
          'Date of Birth': doc.dateOfBirth ? doc.dateOfBirth.toISOString().split('T')[0] : '',
          Gender: doc.gender || '',
          Company: doc.company || '',
          'Job Title': doc.jobTitle || '',
          Department: doc.department || '',
          Industry: doc.industry || '',
          Country: doc.country || '',
          State: doc.state || '',
          City: doc.city || '',
          'Zip Code': doc.zipCode || '',
          Address: doc.address || '',
          LinkedIn: doc.linkedIn || '',
          Website: doc.website || '',
          Twitter: doc.twitter || '',
          Facebook: doc.facebook || '',
          Instagram: doc.instagram || '',
          Tags: doc.tags ? doc.tags.join(', ') : '',
          'Custom Fields': doc.customFields ? JSON.stringify(Object.fromEntries(doc.customFields)) : '',
          'Created At': (doc as any).createdAt ? (doc as any).createdAt.toISOString() : '',
        }));
      } else if (entityType === ExportEntityType.LEADS) {
        const docs = await this.leadModel.find(queryFilter).populate('contactId').exec();
        records = docs.map(doc => {
          const contact = doc.contactId as any;
          return {
            ID: doc._id.toString(),
            'Contact ID': contact?._id ? contact._id.toString() : '',
            'Contact Name': contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : '',
            Source: doc.source || '',
            Status: doc.status || '',
            Value: doc.value || 0,
            'Owner ID': doc.ownerId ? doc.ownerId.toString() : '',
            'Created At': (doc as any).createdAt ? (doc as any).createdAt.toISOString() : '',
          };
        });
      } else if (entityType === ExportEntityType.TASKS) {
        const docs = await this.taskModel.find(queryFilter).exec();
        records = docs.map(doc => ({
          ID: doc._id.toString(),
          Title: doc.title || '',
          Description: doc.description || '',
          Status: doc.status || '',
          Priority: doc.priority || '',
          'Due Date': doc.dueDate ? doc.dueDate.toISOString() : '',
          'Assigned To': doc.assignedToId ? doc.assignedToId.toString() : '',
          'Created At': (doc as any).createdAt ? (doc as any).createdAt.toISOString() : '',
        }));
      } else if (entityType === ExportEntityType.GROUPS) {
        const docs = await this.groupModel.find(queryFilter).exec();
        records = docs.map(doc => ({
          ID: doc._id.toString(),
          Name: doc.name || '',
          Description: doc.description || '',
          'Created At': (doc as any).createdAt ? (doc as any).createdAt.toISOString() : '',
        }));
      }

      // 2. Write Data to File
      if (format === ExportFormat.JSON) {
        fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
      } else if (format === ExportFormat.CSV) {
        const csvContent = this.jsonToCsv(records);
        fs.writeFileSync(filePath, csvContent, 'utf-8');
      } else if (format === ExportFormat.XLSX) {
        const worksheet = xlsx.utils.json_to_sheet(records);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, entityType);
        xlsx.writeFile(workbook, filePath);
      }

      // 3. Update job in DB
      exportJob.status = ExportStatus.COMPLETED;
      exportJob.fileName = fileName;
      exportJob.filePath = filePath;
      exportJob.totalRecords = records.length;
      await exportJob.save();

      // Emit completed audit log
      this.auditLogEmitter.emit('audit.log', {
        orgId,
        userId,
        action: 'export.completed',
        description: `Export completed for ${entityType} (${records.length} records)`,
        metadata: {
          jobId,
          fileName,
          totalRecords: records.length,
        },
      });

    } catch (err: any) {
      exportJob.status = ExportStatus.FAILED;
      await exportJob.save();

      // Cleanup file if it was partially created
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
      }

      this.auditLogEmitter.emit('audit.log', {
        orgId,
        userId,
        action: 'export.failed',
        description: `Export failed for ${entityType}: ${err.message}`,
        metadata: { jobId },
      });

      throw err;
    }
  }

  private jsonToCsv(data: any[]): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const headerLine = headers.map(h => this.escapeCsvValue(h)).join(',');
    const rowLines = data.map(row => 
      headers.map(h => this.escapeCsvValue(row[h])).join(',')
    );
    return [headerLine, ...rowLines].join('\n');
  }

  private escapeCsvValue(val: any): string {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
}
