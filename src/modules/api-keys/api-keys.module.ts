import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKey, ApiKeySchema } from './schemas/api-key.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApiKey.name, schema: ApiKeySchema },
    ]),
  ],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
