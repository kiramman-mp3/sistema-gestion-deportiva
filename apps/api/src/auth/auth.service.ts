import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PermissionsService } from '../authz/permissions.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthContext } from './auth.types.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { PasswordService } from './password.service.js';
import { SecurityHashService } from './security-hash.service.js';
import { SessionService } from './session.service.js';

export interface ClientInfo {
  ip: string;
  userAgent?: string;
}

/** Lo único que el frontend necesita saber de una sesión. */
export interface SessionView {
  user: { id: string; email: string; displayName: string };
  permissions: string[];
  csrfToken: string;
  expiresAt: string;
}

export type LoginResult =
  | { kind: 'ok'; token: string; session: SessionView }
  | { kind: 'throttled'; retryAfterSeconds: number }
  | { kind: 'invalid' };

export function toSessionView(auth: AuthContext): SessionView {
  return {
    user: auth.user,
    permissions: [...auth.permissions].sort(),
    csrfToken: auth.session.csrfToken,
    expiresAt: auth.session.expiresAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(LoginThrottleService)
    private readonly throttle: LoginThrottleService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Inicia sesión. Ante cualquier fallo de credenciales (cuenta inexistente,
   * contraseña incorrecta o cuenta no activa) el resultado es el mismo
   * `invalid`, y se verifica un hash en todos los casos para igualar tiempos.
   */
  async login(
    input: { email: string; password: string },
    client: ClientInfo & { previousToken?: string },
  ): Promise<LoginResult> {
    const { email, password } = input;
    const ipHash = this.hasher.hash('ip', client.ip);

    const gate = await this.throttle.check(email, client.ip);
    if (!gate.allowed) {
      return { kind: 'throttled', retryAfterSeconds: gate.retryAfterSeconds };
    }

    const user = await this.prisma.client.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true,
        status: true,
      },
    });
    const passwordOk = await this.passwords.verify(
      user?.passwordHash ?? null,
      password,
    );

    if (!user || !passwordOk || user.status !== 'activo') {
      await this.onLoginFailure(email, client.ip, ipHash, user, passwordOk);
      return { kind: 'invalid' };
    }

    // Éxito: sesión nueva (rotación), anulación de la anterior y auditoría en una
    // sola transacción. Si la auditoría falla, no se crea la sesión.
    const { created, permissions } = await this.prisma.client.$transaction(
      async (tx) => {
        if (client.previousToken) {
          await this.sessions.revokeByToken(
            client.previousToken,
            'reemplazada',
            tx,
          );
        }
        const created = await this.sessions.create(tx, {
          userId: user.id,
          userAgent: client.userAgent,
          ipHash,
        });
        await tx.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await this.audit.record(
          {
            userId: user.id,
            action: 'auth.login',
            entityType: 'session',
            entityId: created.id,
            ipHash,
          },
          tx,
        );
        return {
          created,
          permissions: await this.permissions.forUser(user.id, tx),
        };
      },
    );

    return {
      kind: 'ok',
      token: created.token,
      session: {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        permissions: [...permissions].sort(),
        csrfToken: created.csrfToken,
        expiresAt: created.expiresAt.toISOString(),
      },
    };
  }

  private async onLoginFailure(
    email: string,
    ip: string,
    ipHash: string,
    user: { id: string; status: string } | null,
    passwordOk: boolean,
  ): Promise<void> {
    // El contador es un control de seguridad: si no se puede anotar, el error se
    // propaga (falla cerrado) en lugar de dejar intentos sin contar.
    const reached = await this.throttle.recordFailure(email, ip);

    // La auditoría de una denegación es de mejor esfuerzo: un fallo al
    // registrarla se informa en el log, pero no cambia la respuesta al cliente.
    const reason = !user
      ? 'cuenta_inexistente'
      : !passwordOk
        ? 'contrasena_incorrecta'
        : 'cuenta_no_activa';
    try {
      const emailHash = this.hasher.hash('audit:email', email);
      await this.audit.record({
        userId: user?.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user?.id,
        after: { reason, emailHash },
        ipHash,
      });
      for (const scope of reached) {
        await this.audit.record({
          userId: user?.id,
          action: 'auth.login_throttled',
          entityType: 'user',
          entityId: user?.id,
          after: { scope, emailHash },
          ipHash,
        });
      }
    } catch (error) {
      this.logger.error(
        'No se pudo auditar un inicio de sesión fallido',
        error,
      );
    }
  }

  async logout(auth: AuthContext, client: ClientInfo): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await this.sessions.revoke(auth.session.id, 'cierre_sesion', tx);
      await this.audit.record(
        {
          userId: auth.user.id,
          action: 'auth.logout',
          entityType: 'session',
          entityId: auth.session.id,
          ipHash: this.hasher.hash('ip', client.ip),
        },
        tx,
      );
    });
  }

  /** Revoca una sesión propia (otro dispositivo o la actual). */
  async revokeOwnSession(
    auth: AuthContext,
    sessionId: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const found = await tx.session.findFirst({
        // Filtrar por usuario evita acceder a sesiones ajenas (IDOR).
        where: { id: sessionId, userId: auth.user.id, revokedAt: null },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Sesión no encontrada');
      await this.sessions.revoke(found.id, 'revocada_por_usuario', tx);
      await this.audit.record(
        {
          userId: auth.user.id,
          action: 'auth.session_revoked',
          entityType: 'session',
          entityId: found.id,
          ipHash: this.hasher.hash('ip', client.ip),
        },
        tx,
      );
    });
  }
}
