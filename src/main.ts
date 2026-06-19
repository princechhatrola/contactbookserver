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

  await app.init();

  if (process.env.VERCEL !== '1') {
    await app.listen(process.env.PORT ?? 3001);
  }

  return app;
}

// Support Vercel serverless deployment
let server: any;
const handler = async (req: any, res: any) => {
  const origin = req.headers.origin || '*';
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(200).end();
    return;
  }

  try {
    if (!server) {
      const app = await bootstrap();
      server = app.getHttpAdapter().getInstance();
    }
    return server(req, res);
  } catch (error: any) {
    console.error('NestJS Bootstrap Error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({
      message: 'Failed to bootstrap NestJS application',
      error: error.message || String(error),
      stack: error.stack,
    }));
  }
};
export default handler;

if (process.env.VERCEL !== '1') {
  bootstrap();
}
