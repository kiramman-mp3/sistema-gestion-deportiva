import {
  ForbiddenException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../authz/permissions.service.js';
import type { Env } from '../config/env.js';
import {
  AUTHENTICATED_KEY,
  PERMISSIONS_KEY,
  PUBLIC_KEY,
} from './decorators.js';
import { AuthGuard, OriginGuard, PermissionsGuard } from './guards.js';
import type { SessionService } from './session.service.js';

class Handler {}

function context(
  request: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
): ExecutionContext {
  // Función nueva por contexto: los metadatos no deben filtrarse entre pruebas
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata))
    Reflect.defineMetadata(key, value, handler);
  return {
    getHandler: () => handler,
    getClass: () => Handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ clearCookie: () => undefined }),
    }),
  } as unknown as ExecutionContext;
}

const env = {
  NODE_ENV: 'test',
  WEB_ORIGIN: ['https://liga.example'],
} as unknown as Env;

describe('OriginGuard', () => {
  const guard = new OriginGuard(env);
  const post = (headers: Record<string, string>) =>
    context({ method: 'POST', headers });

  it('no restringe métodos seguros', () => {
    expect(
      guard.canActivate(
        context({ method: 'GET', headers: { origin: 'https://x.test' } }),
      ),
    ).toBe(true);
  });

  it('acepta el origen configurado, o ninguno (clientes que no son navegador)', () => {
    expect(guard.canActivate(post({ origin: 'https://liga.example' }))).toBe(
      true,
    );
    expect(guard.canActivate(post({}))).toBe(true);
    expect(
      guard.canActivate(
        post({ 'content-type': 'application/json; charset=utf-8' }),
      ),
    ).toBe(true);
  });

  it('rechaza orígenes y referers ajenos o mal formados', () => {
    expect(() =>
      guard.canActivate(post({ origin: 'https://otro.test' })),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(post({ origin: 'null' }))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      guard.canActivate(post({ referer: 'https://otro.test/a' })),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(post({ referer: 'basura' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza cuerpos que no son JSON', () => {
    expect(() =>
      guard.canActivate(
        post({ 'content-type': 'application/x-www-form-urlencoded' }),
      ),
    ).toThrow(UnsupportedMediaTypeException);
    expect(() =>
      guard.canActivate(post({ 'content-type': 'application/jsonp' })),
    ).toThrow(UnsupportedMediaTypeException);
  });
});

describe('AuthGuard', () => {
  const authenticate = vi.fn();
  const sessions = { authenticate } as unknown as SessionService;
  const permissions = { forUser: vi.fn() } as unknown as PermissionsService;
  const guard = new AuthGuard(new Reflector(), sessions, permissions, env);

  beforeEach(() => vi.clearAllMocks());

  it('deniega por defecto una ruta sin política declarada', async () => {
    await expect(
      guard.canActivate(context({ method: 'GET', headers: {} })),
    ).rejects.toThrow(ForbiddenException);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('permite las rutas públicas sin consultar sesión', async () => {
    const ctx = context({ method: 'GET', headers: {} }, { [PUBLIC_KEY]: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('responde 401 sin cookie y no consulta la base de datos', async () => {
    const ctx = context(
      { method: 'GET', headers: {} },
      { [AUTHENTICATED_KEY]: true },
    );
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(authenticate).not.toHaveBeenCalled();
  });
});

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());
  const withPermissions = (granted: string[], required?: string[]) =>
    context(
      { method: 'GET', headers: {}, auth: { permissions: new Set(granted) } },
      required ? { [PERMISSIONS_KEY]: required } : {},
    );

  it('permite cuando están todos los permisos requeridos', () => {
    expect(
      guard.canActivate(withPermissions(['a:x', 'b:y', 'c:z'], ['a:x', 'b:y'])),
    ).toBe(true);
  });

  it('rechaza si falta alguno', () => {
    expect(() =>
      guard.canActivate(withPermissions(['a:x'], ['a:x', 'b:y'])),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(withPermissions([], ['a:x']))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza si no hay identidad aunque se requieran permisos', () => {
    expect(() =>
      guard.canActivate(
        context({ method: 'GET', headers: {} }, { [PERMISSIONS_KEY]: ['a:x'] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('sin permisos declarados no impone nada (la política la fija AuthGuard)', () => {
    expect(guard.canActivate(withPermissions([]))).toBe(true);
  });
});
