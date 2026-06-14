import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportHistory, ImportHistorySchema } from './schemas/import-history.schema';
import { ImportProcessor } from './import.processor';
import { ContactsModule } from '../contacts/contacts.module';
import { Contact, ContactSchema } from '../contacts/schemas/contact.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImportHistory.name, schema: ImportHistorySchema },
      { name: Contact.name, schema: ContactSchema },
    ]),
    BullModule.registerQueue({
      name: 'import-queue',
    }),
    ContactsModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsService, ImportProcessor],
  exports: [ImportsService],
})
export class ImportsModule {}
