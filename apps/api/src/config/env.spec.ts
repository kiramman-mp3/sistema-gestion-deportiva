import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.WEB_ORIGIN).toEqual(['http://localhost:5173']);
  });

  it('convierte el puerto y separa los orígenes permitidos', () => {
    const env = loadEnv({
      API_PORT: '4000',
      WEB_ORIGIN: 'https://a.example, https://b.example',
    });
    expect(env.API_PORT).toBe(4000);
    expect(env.WEB_ORIGIN).toEqual(['https://a.example', 'https://b.example']);
  });

  it('rechaza valores inválidos con un mensaje claro', () => {
    expect(() => loadEnv({ API_PORT: 'abc' })).toThrow(
      /Configuración de entorno inválida: API_PORT/,
    );
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
