import { loadEnv } from './env.js';

const DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
const SECURITY_HASH_KEY = 'k'.repeat(40);
const base = { DATABASE_URL, SECURITY_HASH_KEY };

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.WEB_ORIGIN).toEqual(['http://localhost:5173']);
    expect(env.DATABASE_URL).toBe(DATABASE_URL);
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.SESSION_IDLE_MINUTES).toBe(60);
    expect(env.SESSION_ABSOLUTE_HOURS).toBe(12);
    expect(env.LOGIN_WINDOW_MINUTES).toBe(15);
    expect(env.LOGIN_MAX_FAILURES_PER_ACCOUNT_IP).toBe(5);
  });

  it('convierte el puerto y separa los orígenes permitidos', () => {
    const env = loadEnv({
      ...base,
      API_PORT: '4000',
      WEB_ORIGIN: 'https://a.example, https://b.example',
    });
    expect(env.API_PORT).toBe(4000);
    expect(env.WEB_ORIGIN).toEqual(['https://a.example', 'https://b.example']);
  });

  it('rechaza valores inválidos con un mensaje claro', () => {
    expect(() => loadEnv({ ...base, API_PORT: 'abc' })).toThrow(
      /Configuración de entorno inválida: API_PORT/,
    );
    expect(() => loadEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadEnv({ ...base, SESSION_IDLE_MINUTES: '0' })).toThrow(
      /SESSION_IDLE_MINUTES/,
    );
  });

  it('exige una DATABASE_URL de PostgreSQL', () => {
    expect(() => loadEnv({ SECURITY_HASH_KEY })).toThrow(/DATABASE_URL/);
    expect(() =>
      loadEnv({ ...base, DATABASE_URL: 'mysql://u:p@h/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('exige una SECURITY_HASH_KEY larga y distinta del valor de ejemplo', () => {
    expect(() => loadEnv({ DATABASE_URL })).toThrow(/SECURITY_HASH_KEY/);
    expect(() => loadEnv({ DATABASE_URL, SECURITY_HASH_KEY: 'corta' })).toThrow(
      /SECURITY_HASH_KEY/,
    );
    expect(() =>
      loadEnv({
        DATABASE_URL,
        SECURITY_HASH_KEY: 'cambiar-este-valor-por-un-secreto-largo-123',
      }),
    ).toThrow(/valor de ejemplo/);
  });

  it('en producción exige orígenes https', () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'http://liga.ec',
      }),
    ).toThrow(/https/);
    expect(
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://liga.ec',
      }).WEB_ORIGIN,
    ).toEqual(['https://liga.ec']);
  });

  it('no incluye valores secretos en los mensajes de error', () => {
    let message = '';
    try {
      loadEnv({
        DATABASE_URL: 'mysql://usuario:secreta@h/db',
        SECURITY_HASH_KEY: 'cambiar-clave-muy-secreta-de-ejemplo-123456',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('secreta');
    expect(message).not.toContain('clave-muy');
  });
});
