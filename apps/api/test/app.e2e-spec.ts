import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { loadEnv } from '../src/config/env.js';

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, loadEnv({ WEB_ORIGIN: 'https://liga.example' }));
    await app.init();
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
