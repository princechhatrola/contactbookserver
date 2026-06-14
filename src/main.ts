import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DatadogLogger } from './common/logger/datadog.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(DatadogLogger));

  // Enable CORS
  app.enableCors();

  // Set global prefix to api/v1
  app.setGlobalPrefix('api/v1');

  // Swagger/OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('ContactFlow SaaS API')
    .setDescription('Developer API documentation for ContactFlow SaaS')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
