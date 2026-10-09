import { loadEnv } from './env.js';

const DATABASE_URL = 'postgresql://u:p@localhost:5432/db';

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    const env = loadEnv({ DATABASE_URL });
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.WEB_ORIGIN).toEqual(['http://localhost:5173']);
    expect(env.DATABASE_URL).toBe(DATABASE_URL);
  });

  it('convierte el puerto y separa los orígenes permitidos', () => {
    const env = loadEnv({
      DATABASE_URL,
      API_PORT: '4000',
      WEB_ORIGIN: 'https://a.example, https://b.example',
    });
    expect(env.API_PORT).toBe(4000);
    expect(env.WEB_ORIGIN).toEqual(['https://a.example', 'https://b.example']);
  });

  it('rechaza valores inválidos con un mensaje claro', () => {
    expect(() => loadEnv({ DATABASE_URL, API_PORT: 'abc' })).toThrow(
      /Configuración de entorno inválida: API_PORT/,
    );
    expect(() => loadEnv({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('exige una DATABASE_URL de PostgreSQL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('no incluye el valor de la URL en el mensaje de error', () => {
    let message = '';
    try {
      loadEnv({ DATABASE_URL: 'mysql://usuario:secreta@h/db' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('secreta');
  });
});
