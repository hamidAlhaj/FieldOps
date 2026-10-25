import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { readEnvironment } from './config/environment';
async function bootstrap() {
  const config = readEnvironment();
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  if (config.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app,
      new DocumentBuilder().setTitle('FieldOps API').setVersion('1').addBearerAuth().build()));
  }
  await app.listen(config.PORT, '0.0.0.0');
}
bootstrap().catch(() => { console.error('API startup failed; check configuration and database availability.'); process.exit(1); });
