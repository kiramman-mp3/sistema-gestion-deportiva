import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthContext } from './auth.types.js';
import type { ClientInfo } from './auth.service.js';
import { CredentialTokenService } from './credential-token.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { passwordPolicyViolation } from './password-policy.js';
import { PasswordService } from './password.service.js';
import { SecurityHashService } from './security-hash.service.js';
import { SessionService } from './session.service.js';

export type ChangePasswordResult =
  | { kind: 'ok'; revokedSessions: number }
  | { kind: 'throttled'; retryAfterSeconds: number }
  | { kind: 'wrong_current' };

export type CompleteCredentialResult =
  | { kind: 'ok' }
  | { kind: 'throttled'; retryAfterSeconds: number }
  | { kind: 'invalid' };

/** Marca interna para deshacer la transacción sin tratarlo como un error del servidor. */
class InvalidLink extends Error {}

const fieldError = (field: string, message: string) =>
  new BadRequestException({
    statusCode: 400,
    message: 'Solicitud inválida',
    errors: [{ field, message }],
  });

/** Dominio de los contadores por IP al canjear enlaces (separado de los del login). */
const CREDENTIAL_THROTTLE = 'credential';

@Injectable()
export class PasswordFlowsService {
  private readonly logger = new Logger(PasswordFlowsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(CredentialTokenService)
    private readonly tokens: CredentialTokenService,
    @Inject(LoginThrottleService)
    private readonly throttle: LoginThrottleService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Cambio de la propia contraseña. Exige la contraseña actual (con el mismo límite
   * de intentos fallidos que el login, por si alguien usa una sesión robada para
   * adivinarla) y, al terminar, revoca todas las DEMÁS sesiones de la cuenta y los
   * enlaces pendientes. La sesión actual se conserva.
   */
  async changePassword(
    auth: AuthContext,
    input: { currentPassword: string; newPassword: string },
    client: ClientInfo,
  ): Promise<ChangePasswordResult> {
    const { email } = auth.user;
    const gate = await this.throttle.check(email, client.ip);
    if (!gate.allowed)
      return { kind: 'throttled', retryAfterSeconds: gate.retryAfterSeconds };

    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { passwordHash: true },
    });
    const ipHash = this.hasher.hash('ip', client.ip);
    if (
      !(await this.passwords.verify(user.passwordHash, input.currentPassword))
    ) {
      await this.throttle.recordFailure(email, client.ip);
      // Auditoría de una denegación: mejor esfuerzo.
      try {
        await this.audit.record({
          userId: auth.user.id,
          action: 'auth.password_change_failed',
          entityType: 'user',
          entityId: auth.user.id,
          ipHash,
        });
      } catch (error) {
        this.logger.error(
          'No se pudo auditar un cambio de contraseña fallido',
          error,
        );
      }
      return { kind: 'wrong_current' };
    }

    if (input.newPassword === input.currentPassword) {
      throw fieldError(
        'newPassword',
        'La nueva contraseña debe ser distinta de la actual',
      );
    }
    const violation = passwordPolicyViolation(email, input.newPassword);
    if (violation) throw fieldError('newPassword', violation);

    const passwordHash = await this.passwords.hash(input.newPassword);
    const revokedSessions = await this.prisma.client.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: auth.user.id },
          data: { passwordHash },
        });
        const revoked = await this.sessions.revokeAllForUser(
          auth.user.id,
          'contrasena_cambiada',
          tx,
          auth.session.id,
        );
        await this.tokens.revokeOutstanding(tx, auth.user.id);
        await this.audit.record(
          {
            userId: auth.user.id,
            action: 'auth.password_changed',
            entityType: 'user',
            entityId: auth.user.id,
            after: { revokedSessions: revoked },
            ipHash,
          },
          tx,
        );
        return revoked;
      },
    );
    return { kind: 'ok', revokedSessions };
  }

  /**
   * Canjea un enlace de activación o restablecimiento. El token es de un solo uso
   * (se marca usado en la misma transacción que fija la contraseña). Cualquier fallo
   * del enlace (inexistente, usado, anulado, vencido o cuenta en estado no válido)
   * produce la misma respuesta. Al terminar se revocan TODAS las sesiones.
   */
  async completeCredential(
    input: { token: string; password: string },
    client: ClientInfo,
  ): Promise<CompleteCredentialResult> {
    const gate = await this.throttle.checkIp(CREDENTIAL_THROTTLE, client.ip);
    if (!gate.allowed)
      return { kind: 'throttled', retryAfterSeconds: gate.retryAfterSeconds };

    const ipHash = this.hasher.hash('ip', client.ip);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const consumed = await this.tokens.consume(tx, input.token);
        if (!consumed) throw new InvalidLink();

        const user = await tx.user.findUniqueOrThrow({
          where: { id: consumed.userId },
          select: { id: true, email: true, status: true },
        });
        const expected =
          consumed.kind === 'activacion' ? 'pendiente' : 'activo';
        if (user.status !== expected) throw new InvalidLink();

        // Un rechazo por política deshace la transacción: el enlace sigue sin usarse.
        const violation = passwordPolicyViolation(user.email, input.password);
        if (violation) throw fieldError('password', violation);

        const passwordHash = await this.passwords.hash(input.password);
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash, status: 'activo' },
        });
        const revokedSessions = await this.sessions.revokeAllForUser(
          user.id,
          'contrasena_cambiada',
          tx,
        );
        await this.tokens.revokeOutstanding(tx, user.id);
        await this.audit.record(
          {
            userId: user.id,
            action:
              consumed.kind === 'activacion'
                ? 'auth.account_activated'
                : 'auth.password_reset_completed',
            entityType: 'user',
            entityId: user.id,
            after: { revokedSessions },
            ipHash,
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof InvalidLink) {
        await this.throttle.recordIpFailure(CREDENTIAL_THROTTLE, client.ip);
        return { kind: 'invalid' };
      }
      throw error;
    }
    return { kind: 'ok' };
  }
}
