import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import type { LoginFailureScope } from '../generated/prisma/client.js';
import { SecurityHashService } from './security-hash.service.js';

export type ThrottleResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; scope: LoginFailureScope };

interface Key {
  scope: LoginFailureScope;
  keyHash: string;
  max: number;
}

/**
 * Limita los intentos de inicio de sesión FALLIDOS dentro de una ventana
 * deslizante, con contadores en PostgreSQL (sobreviven a reinicios y se
 * comparten entre instancias). No bloquea cuentas de forma permanente:
 *
 *  - por IP: frena el barrido de muchas cuentas desde un mismo origen;
 *  - por cuenta + IP: frena la adivinación contra una cuenta desde un origen
 *    sin que un tercero pueda dejar fuera al titular legítimo (que usa otra IP);
 *  - por cuenta (límite alto): freno a ataques distribuidos. Es la única clave
 *    que un atacante podría usar para molestar al titular durante una ventana;
 *    por eso su umbral es alto y el bloqueo temporal.
 */
@Injectable()
export class LoginThrottleService {
  private readonly windowMs: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
  ) {
    this.windowMs = env.LOGIN_WINDOW_MINUTES * 60_000;
  }

  private keys(email: string, ip: string): Key[] {
    return [
      {
        scope: 'ip',
        keyHash: this.hasher.hash('login:ip', ip),
        max: this.env.LOGIN_MAX_FAILURES_PER_IP,
      },
      {
        scope: 'cuenta_ip',
        keyHash: this.hasher.hash('login:cuenta_ip', `${email}\u0000${ip}`),
        max: this.env.LOGIN_MAX_FAILURES_PER_ACCOUNT_IP,
      },
      {
        scope: 'cuenta',
        keyHash: this.hasher.hash('login:cuenta', email),
        max: this.env.LOGIN_MAX_FAILURES_PER_ACCOUNT,
      },
    ];
  }

  /** ¿Puede intentarse un inicio de sesión ahora? */
  async check(email: string, ip: string): Promise<ThrottleResult> {
    const since = new Date(Date.now() - this.windowMs);
    let worst: Extract<ThrottleResult, { allowed: false }> | undefined;

    for (const { scope, keyHash, max } of this.keys(email, ip)) {
      const count = await this.prisma.client.loginFailure.count({
        where: { scope, keyHash, createdAt: { gte: since } },
      });
      if (count < max) continue;

      // Se permite de nuevo cuando el fallo que completa el cupo salga de la ventana.
      const blocking = await this.prisma.client.loginFailure.findFirst({
        where: { scope, keyHash, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        skip: max - 1,
        select: { createdAt: true },
      });
      const retryAt =
        (blocking?.createdAt.getTime() ?? Date.now()) + this.windowMs;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((retryAt - Date.now()) / 1000),
      );
      if (!worst || retryAfterSeconds > worst.retryAfterSeconds) {
        worst = { allowed: false, retryAfterSeconds, scope };
      }
    }
    return worst ?? { allowed: true };
  }

  /**
   * Anota un intento fallido. Devuelve los ámbitos cuyo límite se alcanza con
   * este intento (para auditar el bloqueo una sola vez, no en cada rechazo).
   */
  async recordFailure(email: string, ip: string): Promise<LoginFailureScope[]> {
    const keys = this.keys(email, ip);
    await this.prisma.client.loginFailure.createMany({
      data: keys.map(({ scope, keyHash }) => ({ scope, keyHash })),
    });

    const since = new Date(Date.now() - this.windowMs);
    const reached: LoginFailureScope[] = [];
    for (const { scope, keyHash, max } of keys) {
      const count = await this.prisma.client.loginFailure.count({
        where: { scope, keyHash, createdAt: { gte: since } },
      });
      if (count === max) reached.push(scope);
    }
    return reached;
  }
}
