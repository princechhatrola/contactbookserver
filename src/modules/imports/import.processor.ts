import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as path from 'path';
import * as fs from 'fs';
import csv from 'csv-parser';
import * as xlsx from 'xlsx';
import { ImportHistory, ImportHistoryDocument, ImportStatus } from './schemas/import-history.schema';
import { Contact, ContactDocument } from '../contacts/schemas/contact.schema';
import { ContactsService } from '../contacts/contacts.service';
import { AuditLogEmitter } from '../audit-logs/audit-log-emitter';

@Processor('import-queue')
export class ImportProcessor extends WorkerHost {
  constructor(
    @InjectModel(ImportHistory.name)
    private readonly importHistoryModel: Model<ImportHistoryDocument>,
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    private readonly contactsService: ContactsService,
    private readonly auditLogEmitter: AuditLogEmitter,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, orgId, userId, fileId, duplicateStrategy, groupId } = job.data;
    const columnMapping = job.data.columnMapping as Record<string, string>;

    // Load import job from DB
    const importHistory = await this.importHistoryModel.findById(jobId);
    if (!importHistory) {
      throw new Error(`Import job history not found for ID ${jobId}`);
    }

    // Update status to Processing
    importHistory.status = ImportStatus.PROCESSING;
    await importHistory.save();

    // Verify file exists
    const filePath = path.join(process.cwd(), 'uploads', 'imports', fileId);
    if (!fs.existsSync(filePath)) {
      importHistory.status = ImportStatus.FAILED;
      importHistory.rowErrors.push({
        row: 0,
        error: 'Uploaded file could not be found on disk.',
      });
      await importHistory.save();
      
      this.auditLogEmitter.emit('audit.log', {
        orgId,
        userId,
        action: 'import.failed',
        description: `Import job ${importHistory.fileName} failed: File not found`,
        metadata: { jobId },
      });
      return;
    }

    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'import.started',
      description: `Bulk import job started for file ${importHistory.fileName}`,
      metadata: { jobId },
    });

    try {
      // 1. Read all rows from CSV / Excel
      const rawRows = await this.readAllRows(filePath);
      
      // Update totalRecords
      importHistory.totalRecords = rawRows.length;
      await importHistory.save();

      let successCount = 0;
      let failureCount = 0;
      const errorsList: { row: number; name?: string; error: string }[] = [];

      // 2. Loop through each row and import
      for (let i = 0; i < rawRows.length; i++) {
        const rawRow = rawRows[i];
        const rowNum = i + 2; // Data starts at row 2 (header is row 1)

        try {
          // Map raw row headers to schema properties using columnMapping
          const contactDto: any = {};
          const customFields: any = {};

          for (const [fileHeader, schemaField] of Object.entries(columnMapping)) {
            const rawValue = rawRow[fileHeader];
            if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
              const cleanedVal = String(rawValue).trim();
              if (cleanedVal !== '') {
                if (schemaField.startsWith('customFields.')) {
                  const customFieldName = schemaField.split('.')[1];
                  customFields[customFieldName] = cleanedVal;
                } else {
                  contactDto[schemaField] = cleanedVal;
                }
              }
            }
          }

          // Merge custom fields into DTO if any mapped
          if (Object.keys(customFields).length > 0) {
            contactDto.customFields = customFields;
          }

          // Validation rules:
          // Must have firstName and lastName
          if (!contactDto.firstName || !contactDto.lastName) {
            throw new Error(`First Name and Last Name are required fields`);
          }

          // Optional validation: email check
          if (contactDto.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(contactDto.email)) {
              throw new Error(`Invalid email address format: ${contactDto.email}`);
            }
          }

          // Duplicate Strategy Check
          if (contactDto.email) {
            // Find existing contact with this email under this organization
            const existingContact = await this.contactModel.findOne({
              organizationId: new Types.ObjectId(orgId),
              email: contactDto.email.toLowerCase(),
            }).exec();

            if (existingContact) {
              if (duplicateStrategy === 'skip') {
                // Skip importing this row
                successCount++; // Count skipped duplicate as processed success
                continue;
              } else if (duplicateStrategy === 'overwrite') {
                if (groupId) {
                  const currentGroups = existingContact.groups
                    ? existingContact.groups.map((g: any) => (g._id ? g._id.toString() : g.toString()))
                    : [];
                  if (!currentGroups.includes(groupId)) {
                    contactDto.groups = [...currentGroups, groupId];
                  }
                }
                // Update existing contact using ContactsService
                await this.contactsService.updateContact(orgId, userId, existingContact._id.toString(), contactDto);
                successCount++;
                continue;
              }
            }
          }

          if (groupId) {
            contactDto.groups = contactDto.groups || [];
            if (!contactDto.groups.includes(groupId)) {
              contactDto.groups.push(groupId);
            }
          }

          // Create contact
          await this.contactsService.createContact(orgId, userId, contactDto);
          successCount++;

        } catch (rowErr: any) {
          failureCount++;
          if (errorsList.length < 100) {
            const rowIdentifier = rawRow[Object.keys(columnMapping)[0]] || '';
            errorsList.push({
              row: rowNum,
              name: rowIdentifier ? String(rowIdentifier).substring(0, 50) : undefined,
              error: rowErr.message || 'Unknown processing error',
            });
          }
        }

        // Periodic save to keep progress updated (every 100 rows)
        if (i % 100 === 0 || i === rawRows.length - 1) {
          importHistory.successCount = successCount;
          importHistory.failureCount = failureCount;
          importHistory.rowErrors = errorsList;
          await importHistory.save();
        }
      }

      // Finish job
      importHistory.status = ImportStatus.COMPLETED;
      importHistory.successCount = successCount;
      importHistory.failureCount = failureCount;
      importHistory.rowErrors = errorsList;
      await importHistory.save();

      // Emit completed audit log
      this.auditLogEmitter.emit('audit.log', {
        orgId,
        userId,
        action: 'import.completed',
        description: `Bulk import file ${importHistory.fileName} completed: ${successCount} imported, ${failureCount} failed`,
        metadata: {
          jobId,
          totalRecords: rawRows.length,
          successCount,
          failureCount,
        },
      });

    } catch (err: any) {
      importHistory.status = ImportStatus.FAILED;
      importHistory.rowErrors.push({
        row: 0,
        error: `Fatal import processing error: ${err.message}`,
      });
      await importHistory.save();

      this.auditLogEmitter.emit('audit.log', {
        orgId,
        userId,
        action: 'import.failed',
        description: `Import file ${importHistory.fileName} failed: ${err.message}`,
        metadata: { jobId },
      });
    } finally {
      // Delete temp upload file
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          // ignore
        }
      }
    }
  }

  private async readAllRows(filePath: string): Promise<any[]> {
    const isCsv = filePath.toLowerCase().endsWith('.csv');

    if (isCsv) {
      return new Promise((resolve, reject) => {
        const rows: any[] = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data: any) => rows.push(data))
          .on('end', () => resolve(rows))
          .on('error', (err: any) => reject(err));
      });
    } else {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      return xlsx.utils.sheet_to_json<any>(worksheet);
    }
  }
}
