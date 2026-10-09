import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { PermissionsService } from '../authz/permissions.service.js';
import { ENV, type Env } from '../config/config.module.js';
import { type AuthedRequest, CSRF_HEADER } from './auth.types.js';
import {
  AUTHENTICATED_KEY,
  PERMISSIONS_KEY,
  PUBLIC_KEY,
} from './decorators.js';
import { clearSessionCookie, readSessionToken } from './session-cookie.js';
import { SessionService } from './session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * 1.º guard. Defensa CSRF a nivel de origen para peticiones que modifican estado
 * (incluido el login, que no tiene sesión previa):
 *  - si hay `Origin` (o `Referer`), debe ser uno de los orígenes configurados;
 *  - si traen cuerpo, debe ser JSON (los formularios entre sitios no pueden
 *    enviar `application/json` sin pasar por CORS).
 * Los clientes que no son navegadores y no envían ninguno de los dos pasan este
 * guard, pero siguen necesitando cookie de sesión + token CSRF (ver AuthGuard).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: ReadonlySet<string>;

  constructor(@Inject(ENV) env: Env) {
    this.allowed = new Set(env.WEB_ORIGIN);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (origin !== undefined) {
      if (!this.allowed.has(origin))
        throw new ForbiddenException('Origen no permitido');
    } else if (referer !== undefined) {
      let refererOrigin: string | undefined;
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        refererOrigin = undefined;
      }
      if (!refererOrigin || !this.allowed.has(refererOrigin)) {
        throw new ForbiddenException('Origen no permitido');
      }
    }

    const contentType = req.headers['content-type'];
    if (contentType && !/^application\/json\s*(;|$)/i.test(contentType)) {
      throw new UnsupportedMediaTypeException('Se requiere application/json');
    }
    return true;
  }
}

/**
 * 2.º guard. Exige sesión válida salvo en rutas @Public, y token CSRF en
 * métodos que modifican estado. DENEGACIÓN POR DEFECTO: una ruta sin política
 * declarada (@Public, @Authenticated o @RequirePermissions) se rechaza.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) {
      return true;
    }
    const requiresPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) !==
      undefined;
    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATED_KEY,
      targets,
    );
    if (!requiresPermissions && !authenticatedOnly) {
      this.logger.error(
        `Ruta sin política de acceso: ${context.getClass().name}.${context.getHandler().name}`,
      );
      throw new ForbiddenException('Acceso denegado');
    }

    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<Response>();

    const token = readSessionToken(req, this.env);
    const resolved = token ? await this.sessions.authenticate(token) : null;
    if (!resolved) {
      // Una cookie vencida o revocada se elimina para no reenviarla.
      if (token) clearSessionCookie(res, this.env);
      throw new UnauthorizedException('Sesión no válida o expirada');
    }

    if (!SAFE_METHODS.has(req.method)) {
      const sent = req.headers[CSRF_HEADER];
      if (
        typeof sent !== 'string' ||
        !constantTimeEqual(sent, resolved.session.csrfToken)
      ) {
        throw new ForbiddenException('Token CSRF inválido');
      }
    }

    req.auth = {
      ...resolved,
      permissions: await this.permissions.forUser(resolved.user.id),
    };
    return true;
  }
}

/** 3.er guard. Comprueba en el servidor los permisos declarados en la ruta. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth || !required.every((code) => auth.permissions.has(code))) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }
    return true;
  }
}
