import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Import the pre-compiled AppModule and DatadogLogger from dist
// This bypasses esbuild's issues with emitDecoratorMetadata since tsc already compiled these.
import { AppModule } from '../dist/app.module.js';
import { DatadogLogger } from '../dist/common/logger/datadog.logger.js';

const expressApp = express();
let cachedServer: any;

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    { bufferLogs: true }
  );

  app.useLogger(app.get(DatadogLogger));
  app.enableCors();
  app.setGlobalPrefix('api/v1');

  // Swagger/OpenAPI setup (replicating src/main.ts setup)
  const config = new DocumentBuilder()
    .setTitle('ContactFlow SaaS API')
    .setDescription('Developer API documentation for ContactFlow SaaS')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.init();
  return expressApp;
}

export default async (req: any, res: any) => {
  if (!cachedServer) {
    cachedServer = await bootstrap();
  }
  return cachedServer(req, res);
};
