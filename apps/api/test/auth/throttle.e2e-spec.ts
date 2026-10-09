import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  TEST_ORIGIN,
  createTestApp,
  setCookies,
  type TestApp,
} from '../support/app.js';
import { createTestPrisma, resetDatabase } from '../support/db.js';
import { PASSWORD, createUser, seedCatalog } from '../support/fixtures.js';

const LIMITS = {
  TRUST_PROXY: '1',
  LOGIN_WINDOW_MINUTES: '15',
  LOGIN_MAX_FAILURES_PER_IP: '8',
  LOGIN_MAX_FAILURES_PER_ACCOUNT_IP: '3',
  LOGIN_MAX_FAILURES_PER_ACCOUNT: '6',
};

describe('limitación de intentos de inicio de sesión', () => {
  let prisma: PrismaClient;
  let t: TestApp;

  beforeAll(async () => {
    prisma = createTestPrisma();
    t = await createTestApp({ env: LIMITS });
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedCatalog(prisma);
  });
  afterAll(async () => {
    await t.close();
    await prisma.$disconnect();
  });

  const attempt = (
    email: string,
    password: string,
    ip: string,
    app: TestApp = t,
  ) =>
    app
      .http()
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ email, password });

  it('bloquea temporalmente tras superar el límite de fallos por cuenta e IP, incluso con la contraseña correcta', async () => {
    const user = await createUser(prisma, { email: 'ana@example.com' });
    for (let i = 0; i < 3; i++) {
      await attempt(user.email, 'incorrecta-incorrecta', '203.0.113.5').expect(
        401,
      );
    }
    const blocked = await attempt(user.email, PASSWORD, '203.0.113.5');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(15 * 60);
    expect(blocked.body.message).toBe(
      'Demasiados intentos. Intente más tarde.',
    );
    expect(setCookies(blocked)).toEqual([]);
    expect(await prisma.session.count()).toBe(0);
  });

  it('no deja fuera al titular legítimo cuando el atacante falla desde otra IP', async () => {
    const user = await createUser(prisma, { email: 'ana@example.com' });
    for (let i = 0; i < 3; i++) {
      await attempt(user.email, 'incorrecta-incorrecta', '198.51.100.9').expect(
        401,
      );
    }
    await attempt(user.email, PASSWORD, '198.51.100.9').expect(429);
    // El titular, desde su IP, puede iniciar sesión
    await attempt(user.email, PASSWORD, '203.0.113.77').expect(200);
  });

  it('la cuenta no queda bloqueada de forma permanente: el bloqueo expira con la ventana', async () => {
    const user = await createUser(prisma, { email: 'ana@example.com' });
    for (let i = 0; i < 3; i++) {
      await attempt(user.email, 'incorrecta-incorrecta', '203.0.113.5').expect(
        401,
      );
    }
    await attempt(user.email, PASSWORD, '203.0.113.5').expect(429);

    // Los fallos salen de la ventana de 15 minutos
    await prisma.loginFailure.updateMany({
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });
    await attempt(user.email, PASSWORD, '203.0.113.5').expect(200);
  });

  it('limita por IP el barrido de muchas cuentas', async () => {
    for (let i = 0; i < 8; i++) {
      await attempt(
        `victima${i}@example.com`,
        'incorrecta-incorrecta',
        '192.0.2.50',
      ).expect(401);
    }
    const legit = await createUser(prisma, { email: 'ana@example.com' });
    await attempt(legit.email, PASSWORD, '192.0.2.50').expect(429);
    await attempt(legit.email, PASSWORD, '192.0.2.51').expect(200);
  });

  it('aplica un límite alto por cuenta ante ataques distribuidos', async () => {
    const user = await createUser(prisma, { email: 'ana@example.com' });
    for (let i = 0; i < 6; i++) {
      await attempt(
        user.email,
        'incorrecta-incorrecta',
        `198.51.100.${i + 1}`,
      ).expect(401);
    }
    // Siete IPs distintas ya sumaron seis fallos contra la cuenta
    await attempt(user.email, PASSWORD, '198.51.100.99').expect(429);
  });

  it('los contadores persisten tras reiniciar la aplicación', async () => {
    const user = await createUser(prisma, { email: 'ana@example.com' });
    for (let i = 0; i < 3; i++) {
      await attempt(user.email, 'incorrecta-incorrecta', '203.0.113.5').expect(
        401,
      );
    }
    const restarted = await createTestApp({ env: LIMITS });
    try {
      await attempt(user.email, PASSWORD, '203.0.113.5', restarted).expect(429);
    } finally {
      await restarted.close();
    }
  });

  it('un login correcto no se cuenta como fallo', async () => {
    const user = await createUser(prisma, { email: 'ana@example.com' });
    for (let i = 0; i < 6; i++)
      await attempt(user.email, PASSWORD, '203.0.113.5').expect(200);
    expect(await prisma.loginFailure.count()).toBe(0);
  });

  it('audita el bloqueo una sola vez, no en cada rechazo', async () => {
    const user = await createUser(prisma, { email: 'ana@example.com' });
    for (let i = 0; i < 3; i++) {
      await attempt(user.email, 'incorrecta-incorrecta', '203.0.113.5').expect(
        401,
      );
    }
    for (let i = 0; i < 4; i++)
      await attempt(user.email, PASSWORD, '203.0.113.5').expect(429);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'auth.login_throttled' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.afterSnapshot).toMatchObject({ scope: 'cuenta_ip' });
    expect(
      await prisma.auditLog.count({ where: { action: 'auth.login_failed' } }),
    ).toBe(3);
  });

  it('guarda hashes con clave, no IP ni correos', async () => {
    await attempt(
      'ana@example.com',
      'incorrecta-incorrecta',
      '203.0.113.5',
    ).expect(401);
    const rows = await prisma.loginFailure.findMany();
    expect(rows).toHaveLength(3);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('ana@example.com');
    expect(dump).not.toContain('203.0.113.5');
    for (const row of rows) expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sin proxy de confianza, X-Forwarded-For no permite eludir ni falsificar el límite', async () => {
    const direct = await createTestApp({
      env: { ...LIMITS, TRUST_PROXY: '0' },
    });
    try {
      const user = await createUser(prisma, { email: 'ana@example.com' });
      // El atacante cambia la cabecera en cada intento: todos cuentan para la misma IP real
      for (let i = 0; i < 3; i++) {
        await attempt(
          user.email,
          'incorrecta-incorrecta',
          `10.0.0.${i + 1}`,
          direct,
        ).expect(401);
      }
      await attempt(user.email, PASSWORD, '10.0.0.99', direct).expect(429);
    } finally {
      await direct.close();
    }
  });
});
