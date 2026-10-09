import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api';

/** Configuración común de la aplicación, compartida por main.ts y las pruebas e2e. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  // Con proxy inverso, Express debe confiar en X-Forwarded-For solo de los
  // saltos configurados; si no, la IP (y los límites por IP) serían falsificables.
  app.set('trust proxy', env.TRUST_PROXY);
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  // Las respuestas de la API son dinámicas y pueden contener datos privados.
  app.use(
    `/${API_PREFIX}`,
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );

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
