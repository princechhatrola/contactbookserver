// Import reflect-metadata at the top
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const express = require('express');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');

// Require the pre-compiled AppModule and DatadogLogger from dist
const { AppModule } = require('../dist/app.module');
const { DatadogLogger } = require('../dist/common/logger/datadog.logger');

const expressApp = express();
let cachedServer;

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

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(200).end();
    return;
  }

  if (!cachedServer) {
    cachedServer = await bootstrap();
  }
  return cachedServer(req, res);
};
