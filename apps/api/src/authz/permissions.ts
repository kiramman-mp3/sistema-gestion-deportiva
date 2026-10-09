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
  'sports:manage': 'Crear, modificar y desactivar deportes',
  'categories:read': 'Consultar categorías',
  'categories:manage': 'Crear, modificar y desactivar categorías',
  'seasons:read': 'Consultar temporadas',
  'seasons:manage': 'Crear, modificar y cambiar el estado de temporadas',
} as const satisfies Record<string, string>;

export type PermissionCode = keyof typeof PERMISSIONS;

export const SUPERADMIN_ROLE = {
  code: 'superadmin',
  name: 'Superadministrador',
  description:
    'Configura la plataforma, usuarios, roles y catálogos. Rol de sistema.',
} as const;
