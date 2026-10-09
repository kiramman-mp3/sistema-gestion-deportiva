import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ENV, type Env } from '../config/config.module.js';
import { AuthService, type ClientInfo, toSessionView } from './auth.service.js';
import { PasswordFlowsService } from './password-flows.service.js';
import { type AuthContext, type AuthedRequest } from './auth.types.js';
import { Authenticated, CurrentAuth, Public } from './decorators.js';
import {
  changePasswordSchema,
  completeCredentialSchema,
  loginSchema,
  parseOrThrow,
  uuidSchema,
} from './schemas.js';
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from './session-cookie.js';
import { SessionService } from './session.service.js';

function clientInfo(req: AuthedRequest): ClientInfo {
  return {
    ip: req.ip ?? 'desconocida',
    userAgent: req.headers['user-agent'],
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PasswordFlowsService)
    private readonly passwordFlows: PasswordFlowsService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Inicia sesión. Devuelve el token CSRF que el frontend enviará en cada escritura. */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    const input = parseOrThrow(loginSchema, body);
    const result = await this.auth.login(input, {
      ...clientInfo(req),
      previousToken: readSessionToken(req, this.env),
    });

    if (result.kind === 'throttled') {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(
        { statusCode: 429, message: 'Demasiados intentos. Intente más tarde.' },
        429,
      );
    }
    if (result.kind === 'invalid') {
      // Mismo mensaje para cuenta inexistente, contraseña errónea o cuenta inactiva.
      throw new UnauthorizedException('Credenciales inválidas');
    }
    setSessionCookie(res, this.env, result.token);
    return result.session;
  }

  /** Sesión y usuario actuales. 401 si no hay sesión vigente. */
  @Authenticated()
  @Get('session')
  session(@CurrentAuth() auth: AuthContext) {
    return toSessionView(auth);
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth, clientInfo(req));
    clearSessionCookie(res, this.env);
  }

  /** Sesiones vigentes propias (sin identificadores secretos). */
  @Authenticated()
  @Get('sessions')
  async list(@CurrentAuth() auth: AuthContext) {
    const active = await this.sessions.listActive(auth.user.id);
    return active.map((s) => ({ ...s, current: s.id === auth.session.id }));
  }

  @Authenticated()
  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ): Promise<void> {
    const sessionId = parseOrThrow(uuidSchema, id);
    await this.auth.revokeOwnSession(auth, sessionId, clientInfo(req));
    if (sessionId === auth.session.id) clearSessionCookie(res, this.env);
  }

  private throttled(res: Response, retryAfterSeconds: number): never {
    res.setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpException(
      { statusCode: 429, message: 'Demasiados intentos. Intente más tarde.' },
      429,
    );
  }

  /**
   * Cambia la contraseña propia. Revoca las demás sesiones. Una contraseña actual
   * incorrecta responde 400 (nunca 401: la sesión sigue siendo válida).
   */
  @Authenticated()
  @Post('password/change')
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    const input = parseOrThrow(changePasswordSchema, body);
    const result = await this.passwordFlows.changePassword(
      auth,
      input,
      clientInfo(req),
    );
    if (result.kind === 'throttled')
      this.throttled(res, result.retryAfterSeconds);
    if (result.kind === 'wrong_current') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Solicitud inválida',
        errors: [
          {
            field: 'currentPassword',
            message: 'La contraseña actual no es correcta',
          },
        ],
      });
    }
    return { revokedSessions: result.revokedSessions };
  }

  /**
   * Canjea un enlace de activación o restablecimiento emitido por un administrador y
   * fija la contraseña. Pública: la autoriza el token de un solo uso.
   */
  @Public()
  @Post('password/complete')
  @HttpCode(204)
  async completeCredential(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    const input = parseOrThrow(completeCredentialSchema, body);
    const result = await this.passwordFlows.completeCredential(
      input,
      clientInfo(req),
    );
    if (result.kind === 'throttled')
      this.throttled(res, result.retryAfterSeconds);
    if (result.kind === 'invalid') {
      throw new BadRequestException('El enlace no es válido o ya venció');
    }
  }
}
