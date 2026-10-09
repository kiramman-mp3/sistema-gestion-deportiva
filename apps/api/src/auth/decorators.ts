import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { PermissionCode } from '../authz/permissions.js';
import type { AuthContext, AuthedRequest } from './auth.types.js';

export const PUBLIC_KEY = 'auth:public';
export const AUTHENTICATED_KEY = 'auth:authenticated';
export const PERMISSIONS_KEY = 'auth:permissions';

/**
 * Política de acceso OBLIGATORIA en cada ruta (denegación por defecto): una
 * ruta sin ninguno de estos tres decoradores es rechazada con 403.
 */

/** Ruta accesible sin sesión. Usar solo donde sea imprescindible. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Cualquier usuario con sesión válida, sin permiso específico. */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

/** Sesión válida y TODOS los permisos indicados (derivados de la base de datos). */
export const RequirePermissions = (
  ...codes: [PermissionCode, ...PermissionCode[]]
) => SetMetadata(PERMISSIONS_KEY, codes);

/** Inyecta la identidad de la petición autenticada. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth) {
      throw new Error('CurrentAuth usado en una ruta sin autenticación');
    }
    return auth;
  },
);
