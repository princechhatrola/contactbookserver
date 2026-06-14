import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { Activity, ActivitySchema } from './schemas/activity.schema';
import { ActivityEmitter } from './activity-emitter';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
    ]),
  ],
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    ActivityEmitter,
  ],
  exports: [
    ActivitiesService,
    ActivityEmitter,
  ],
})
export class ActivitiesModule {}
