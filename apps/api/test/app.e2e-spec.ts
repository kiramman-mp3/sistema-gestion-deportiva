import { createTestApp, type TestApp } from './support/app.js';

describe('API (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('GET /api/health responde ok sin sesión', async () => {
    const response = await t.http().get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('GET /api/health/ready consulta la base de datos real', async () => {
    const response = await t.http().get('/api/health/ready').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('GET /api/health/ready devuelve 503 sin detalles si la base de datos no responde', async () => {
    // Puerto 1: nada escucha, la conexión es rechazada de inmediato.
    const broken = await createTestApp({
      env: { DATABASE_URL: 'postgresql://u:secreta@127.0.0.1:1/x_test' },
    });
    try {
      const response = await broken.http().get('/api/health/ready').expect(503);
      expect(JSON.stringify(response.body)).not.toMatch(/secreta|127\.0\.0\.1/);
    } finally {
      await broken.close();
    }
  });

  it('envía cabeceras de seguridad y no cachea las respuestas', async () => {
    const response = await t.http().get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('solo permite CORS desde el origen configurado, con credenciales', async () => {
    const allowed = await t
      .http()
      .get('/api/health')
      .set('Origin', 'https://liga.example');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://liga.example',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await t
      .http()
      .get('/api/health')
      .set('Origin', 'https://malicioso.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('expone la documentación OpenAPI fuera de producción', async () => {
    await t.http().get('/api/docs-json').expect(200);
  });
});
