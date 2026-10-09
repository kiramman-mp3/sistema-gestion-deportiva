import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api';

/** Configuración común de la aplicación, compartida por main.ts y las pruebas e2e. */
export function configureApp(app: INestApplication, env: Env): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });

  if (env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Liga Cantonal de Quero — API')
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
  }
}
