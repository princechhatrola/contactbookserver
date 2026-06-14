import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportJob, ExportJobSchema } from './schemas/export-job.schema';
import { ExportProcessor } from './export.processor';
import { Contact, ContactSchema } from '../contacts/schemas/contact.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { Group, GroupSchema } from '../groups/schemas/group.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExportJob.name, schema: ExportJobSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Group.name, schema: GroupSchema },
    ]),
    BullModule.registerQueue({
      name: 'export-queue',
    }),
  ],
  controllers: [ExportsController],
  providers: [ExportsService, ExportProcessor],
  exports: [ExportsService],
})
export class ExportsModule {}
