import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldsController } from './custom-fields.controller';
import { Contact, ContactSchema } from './schemas/contact.schema';
import { CustomFieldDefinition, CustomFieldDefinitionSchema } from './schemas/custom-field-definition.schema';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contact.name, schema: ContactSchema },
      { name: CustomFieldDefinition.name, schema: CustomFieldDefinitionSchema },
    ]),
    TagsModule,
  ],
  controllers: [ContactsController, CustomFieldsController],
  providers: [ContactsService, CustomFieldsService],
  exports: [ContactsService, CustomFieldsService],
})
export class ContactsModule {}
