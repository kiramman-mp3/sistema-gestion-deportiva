import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ENV } from '../src/config/config.module.js';
import { loadEnv } from '../src/config/env.js';

async function createApp(databaseUrl: string): Promise<INestApplication> {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN: 'https://liga.example',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, env);
  await app.init();
  return app;
}

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde ok', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('GET /api/health/ready consulta la base de datos real', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('GET /api/health/ready devuelve 503 sin detalles si la base de datos no responde', async () => {
    // Puerto 1: nada escucha, la conexión es rechazada de inmediato.
    const broken = await createApp('postgresql://u:secreta@127.0.0.1:1/x_test');
    try {
      const response = await request(broken.getHttpServer())
        .get('/api/health/ready')
        .expect(503);
      expect(JSON.stringify(response.body)).not.toMatch(/secreta|127\.0\.0\.1/);
    } finally {
      await broken.close();
    }
  });

  it('envía cabeceras de seguridad', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('solo permite CORS desde el origen configurado', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://liga.example');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://liga.example',
    );

    const denied = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://malicioso.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('expone la documentación OpenAPI fuera de producción', async () => {
    await request(app.getHttpServer()).get('/api/docs-json').expect(200);
  });
});
