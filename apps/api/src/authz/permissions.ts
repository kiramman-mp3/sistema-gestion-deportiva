/**
 * Catálogo de permisos. Cada permiso existe porque el backend lo comprueba;
 * `db:seed` lo sincroniza con la tabla `permissions`. Formato `recurso:acción`.
 *
 * Los roles institucionales (secretaría, comisión técnica…) NO se definen aquí:
 * la distribución real de permisos la debe aprobar la Liga (ver docs/decisions.md).
 */
export const PERMISSIONS = {
  'users:read': 'Consultar usuarios',
  'users:create': 'Crear usuarios',
  'users:update': 'Modificar usuarios y desactivarlos',
  'roles:read': 'Consultar roles y permisos',
  'roles:manage': 'Crear roles y asignar permisos y roles a usuarios',
  'audit:read': 'Consultar la auditoría',
  'sports:read': 'Consultar deportes',
  'sports:manage': 'Crear, modificar y activar o desactivar deportes',
  'sports:delete': 'Eliminar deportes que no estén en uso',
  'categories:read': 'Consultar categorías',
  'categories:manage': 'Crear, modificar y activar o desactivar categorías',
  'categories:delete': 'Eliminar categorías que no estén en uso',
  'seasons:read': 'Consultar temporadas',
  'seasons:manage': 'Crear, modificar y cambiar el estado de temporadas',
  'seasons:delete': 'Eliminar temporadas en borrador que no estén en uso',
} as const satisfies Record<string, string>;

export type PermissionCode = keyof typeof PERMISSIONS;

export const SUPERADMIN_ROLE = {
  code: 'superadmin',
  name: 'Superadministrador',
  description:
    'Configura la plataforma, usuarios, roles y catálogos. Rol de sistema.',
} as const;

/** Módulos del catálogo, en el orden en que se presentan. */
export const PERMISSION_MODULES = {
  users: 'Usuarios',
  roles: 'Roles y permisos',
  audit: 'Auditoría',
  sports: 'Deportes',
  categories: 'Categorías',
  seasons: 'Temporadas',
} as const satisfies Record<string, string>;

/**
 * Capacidades distintas y no intercambiables: «consultar» no permite cambiar nada,
 * «gestionar» no permite eliminar, y «eliminar» es un permiso aparte.
 */
export const PERMISSION_ACTIONS = {
  read: 'Consultar',
  create: 'Crear',
  update: 'Modificar',
  manage: 'Gestionar',
  delete: 'Eliminar',
} as const satisfies Record<string, string>;

export interface PermissionInfo {
  code: PermissionCode;
  description: string;
  module: string;
  moduleLabel: string;
  action: string;
  actionLabel: string;
}

/** Catálogo completo con su módulo y acción, listo para agrupar en una interfaz. */
export function listPermissions(): PermissionInfo[] {
  const moduleOrder = Object.keys(PERMISSION_MODULES);
  return (Object.keys(PERMISSIONS) as PermissionCode[])
    .map((code) => {
      const [module = '', action = ''] = code.split(':');
      return {
        code,
        description: PERMISSIONS[code],
        module,
        moduleLabel:
          PERMISSION_MODULES[module as keyof typeof PERMISSION_MODULES] ??
          module,
        action,
        actionLabel:
          PERMISSION_ACTIONS[action as keyof typeof PERMISSION_ACTIONS] ??
          action,
      };
    })
    .sort(
      (a, b) =>
        moduleOrder.indexOf(a.module) - moduleOrder.indexOf(b.module) ||
        Object.keys(PERMISSION_ACTIONS).indexOf(a.action) -
          Object.keys(PERMISSION_ACTIONS).indexOf(b.action),
    );
}

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.hasOwn(PERMISSIONS, value);
}
