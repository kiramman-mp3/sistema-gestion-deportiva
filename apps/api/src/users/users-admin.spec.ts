import { REDACTED, sanitizeSnapshot } from '../audit/sanitize.js';
import { passwordPolicyViolation } from '../auth/password-policy.js';
import {
  PERMISSIONS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  isPermissionCode,
  listPermissions,
} from '../authz/permissions.js';
import {
  createRoleSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
} from './roles.schemas.js';
import {
  createUserSchema,
  setUserStatusSchema,
  updateUserSchema,
} from './users.schemas.js';

describe('catálogo de permisos con metadatos', () => {
  it('cada permiso pertenece a un módulo y a una acción conocidos', () => {
    for (const info of listPermissions()) {
      expect(Object.keys(PERMISSION_MODULES), info.code).toContain(info.module);
      expect(Object.keys(PERMISSION_ACTIONS), info.code).toContain(info.action);
      expect(info.moduleLabel).not.toBe(info.module);
      expect(info.actionLabel).not.toBe(info.action);
    }
  });

  it('lista exactamente los permisos definidos, agrupados por módulo y con acciones en orden', () => {
    const list = listPermissions();
    expect(list.map((p) => p.code).sort()).toEqual(
      Object.keys(PERMISSIONS).sort(),
    );
    const modules = list.map((p) => p.module);
    // Los módulos aparecen contiguos
    expect(modules.join(',')).toBe(
      [...new Set(modules)]
        .flatMap((m) => modules.filter((x) => x === m))
        .join(','),
    );
    expect(
      list.filter((p) => p.module === 'sports').map((p) => p.action),
    ).toEqual(['read', 'manage', 'delete']);
  });

  it('leer, gestionar y eliminar son permisos distintos y no se convierten en create/update', () => {
    for (const module of ['sports', 'categories', 'seasons']) {
      for (const action of ['read', 'manage', 'delete'])
        expect(isPermissionCode(`${module}:${action}`)).toBe(true);
      expect(isPermissionCode(`${module}:create`)).toBe(false);
      expect(isPermissionCode(`${module}:update`)).toBe(false);
    }
  });

  it('isPermissionCode no acepta variaciones ni propiedades heredadas', () => {
    for (const bad of [
      'SPORTS:READ',
      ' sports:read',
      'sports:read ',
      'toString',
      '__proto__',
      'constructor',
      '',
    ]) {
      expect(isPermissionCode(bad), bad).toBe(false);
    }
  });
});

describe('saneado de valores de auditoría', () => {
  it('enmascara claves que sugieren secretos, a cualquier profundidad', () => {
    const out = sanitizeSnapshot({
      passwordHash: 'x',
      nested: { deep: { csrfToken: 'y', session_cookie: 'z' } },
      list: [{ apiKey: 'k' }],
      email: 'ana@liga.example',
      revokedSessions: 3,
    });
    expect(out).toEqual({
      passwordHash: REDACTED,
      nested: { deep: { csrfToken: REDACTED, session_cookie: REDACTED } },
      list: [{ apiKey: REDACTED }],
      email: 'ana@liga.example',
      revokedSessions: 3,
    });
  });

  it('enmascara valores con forma de hash o token aunque la clave sea inocua', () => {
    expect(sanitizeSnapshot({ nota: '$argon2id$v=19$m=1' })).toEqual({
      nota: REDACTED,
    });
    expect(sanitizeSnapshot({ nota: 'a'.repeat(43) })).toEqual({
      nota: REDACTED,
    });
    expect(sanitizeSnapshot({ nota: 'f'.repeat(64) })).toEqual({
      nota: REDACTED,
    });
    expect(
      sanitizeSnapshot({ nota: '0197aaaa-0000-7000-8000-000000000000' }),
    ).toEqual({
      nota: '0197aaaa-0000-7000-8000-000000000000',
    });
  });

  it('conserva valores normales y tipos primitivos, y acota la profundidad', () => {
    expect(sanitizeSnapshot(null)).toBeNull();
    expect(sanitizeSnapshot({ n: 1, b: true, s: 'texto', x: null })).toEqual({
      n: 1,
      b: true,
      s: 'texto',
      x: null,
    });
    let deep: unknown = { fin: 'x' };
    for (let i = 0; i < 10; i++) deep = { a: deep };
    expect(JSON.stringify(sanitizeSnapshot(deep))).toContain(REDACTED);
  });
});

describe('política de contraseñas nuevas', () => {
  it('rechaza contraseñas que contienen el nombre de usuario del correo (si tiene 4+ caracteres)', () => {
    expect(
      passwordPolicyViolation(
        'maria.fernandez@liga.ec',
        'xx-Maria.Fernandez-9',
      ),
    ).not.toBeNull();
    expect(
      passwordPolicyViolation(
        'maria.fernandez@liga.ec',
        'una-frase-sin-relacion-1',
      ),
    ).toBeNull();
    expect(
      passwordPolicyViolation('ana@liga.ec', 'ana-ana-ana-ana-ana'),
    ).toBeNull();
  });
});

describe('esquemas de administración', () => {
  it('el alta solo admite correo y nombre', () => {
    expect(
      createUserSchema.safeParse({
        email: ' A@B.CO ',
        displayName: ' Ana  Pérez ',
      }),
    ).toMatchObject({
      success: true,
      data: { email: 'a@b.co', displayName: 'Ana Pérez' },
    });
    for (const extra of [
      { password: 'x'.repeat(12) },
      { status: 'activo' },
      { roles: [] },
      { isAdmin: true },
    ]) {
      expect(
        createUserSchema.safeParse({
          email: 'a@b.co',
          displayName: 'A',
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it('la edición exige algún campo y rechaza estado, roles y contraseña', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ displayName: 'Ana' }).success).toBe(
      true,
    );
    for (const extra of [
      { status: 'activo' },
      { roles: [] },
      { passwordHash: 'x' },
      { id: 'x' },
    ]) {
      expect(updateUserSchema.safeParse(extra).success).toBe(false);
    }
  });

  it('el cambio de estado exige motivo y no admite «pendiente»', () => {
    expect(
      setUserStatusSchema.safeParse({ status: 'inactivo', reason: 'Baja' })
        .success,
    ).toBe(true);
    expect(setUserStatusSchema.safeParse({ status: 'inactivo' }).success).toBe(
      false,
    );
    expect(
      setUserStatusSchema.safeParse({ status: 'pendiente', reason: 'Baja' })
        .success,
    ).toBe(false);
  });

  it('los roles: código con formato, sin isSystem, permisos como lista sin duplicados', () => {
    expect(
      createRoleSchema.safeParse({ code: 'mi_rol', name: 'Mi rol' }).success,
    ).toBe(true);
    expect(
      createRoleSchema.safeParse({ code: 'Mi Rol', name: 'X' }).success,
    ).toBe(false);
    expect(
      createRoleSchema.safeParse({ code: 'mi_rol', name: 'X', isSystem: true })
        .success,
    ).toBe(false);
    expect(
      setRolePermissionsSchema.parse({ permissions: ['a:b', 'a:b', 'c:d'] })
        .permissions,
    ).toEqual(['a:b', 'c:d']);
    expect(
      setRolePermissionsSchema.safeParse({ permissions: 'a:b' }).success,
    ).toBe(false);
    expect(
      setRolePermissionsSchema.safeParse({ permissions: [], extra: 1 }).success,
    ).toBe(false);
    expect(updateRoleSchema.safeParse({}).success).toBe(false);
    expect(updateRoleSchema.safeParse({ code: 'otro' }).success).toBe(false);
  });
});
