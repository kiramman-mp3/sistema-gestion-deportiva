import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ENV, type Env } from './config/config.module.js';
import { loadRootDotenv } from './config/dotenv.js';

async function bootstrap() {
  loadRootDotenv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  const env = app.get<Env>(ENV);
  configureApp(app, env);
  await app.listen(env.API_PORT);
}
await bootstrap();
