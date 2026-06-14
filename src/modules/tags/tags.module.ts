import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { Tag, TagSchema } from './schemas/tag.schema';
import { Contact, ContactSchema } from '../contacts/schemas/contact.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tag.name, schema: TagSchema },
      { name: Contact.name, schema: ContactSchema },
    ]),
  ],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
