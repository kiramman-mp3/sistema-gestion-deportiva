import { randomBytes } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ENV, type Env } from '../config/config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  Prisma,
  SessionRevocationReason,
} from '../generated/prisma/client.js';
import type { AuthContext } from './auth.types.js';
import { sha256Hex } from './security-hash.service.js';

/** El identificador de sesión son 32 bytes aleatorios en base64url (43 caracteres). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Evita una escritura por petición: la actividad se anota como máximo cada minuto. */
const TOUCH_INTERVAL_MS = 60_000;
const PURGE_INTERVAL_MS = 60 * 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60_000;

export interface CreatedSession {
  /** Valor para la cookie. Solo existe en este instante; en BD queda su hash. */
  token: string;
  id: string;
  csrfToken: string;
  expiresAt: Date;
}

export interface ActiveSessionInfo {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  userAgent: string | null;
}

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private purgeTimer: NodeJS.Timeout | undefined;
  private readonly idleMs: number;
  private readonly absoluteMs: number;
  private readonly loginWindowMs: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.idleMs = env.SESSION_IDLE_MINUTES * 60_000;
    this.absoluteMs = env.SESSION_ABSOLUTE_HOURS * 3_600_000;
    this.loginWindowMs = env.LOGIN_WINDOW_MINUTES * 60_000;
  }

  onModuleInit(): void {
    this.purgeTimer = setInterval(() => {
      this.purgeExpired().catch((error: unknown) =>
        this.logger.error('Fallo al depurar sesiones caducadas', error),
      );
    }, PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.purgeTimer);
  }

  /** Crea una sesión nueva con identificador y token CSRF aleatorios. */
  async create(
    tx: Prisma.TransactionClient,
    params: { userId: string; userAgent?: string; ipHash?: string },
  ): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.absoluteMs);
    const session = await tx.session.create({
      data: {
        userId: params.userId,
        tokenHash: sha256Hex(token),
        csrfToken,
        userAgent: params.userAgent?.slice(0, 255),
        ipHash: params.ipHash,
        expiresAt,
      },
    });
    return { token, id: session.id, csrfToken, expiresAt };
  }

  /**
   * Resuelve una sesión a partir del valor de la cookie. Devuelve `null` si no
   * existe, fue revocada, caducó (absoluta o por inactividad) o la cuenta ya
   * no está activa.
   */
  async authenticate(
    token: string,
  ): Promise<Omit<AuthContext, 'permissions'> | null> {
    if (!TOKEN_PATTERN.test(token)) return null;

    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
      },
    });
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    const idleExpiresAt = session.lastSeenAt.getTime() + this.idleMs;
    if (session.expiresAt.getTime() <= now || idleExpiresAt <= now) return null;

    if (session.user.status !== 'activo') {
      await this.revoke(session.id, 'cuenta_desactivada').catch(
        (error: unknown) =>
          this.logger.error(
            'No se pudo revocar la sesión de una cuenta inactiva',
            error,
          ),
      );
      return null;
    }

    let lastSeen = session.lastSeenAt.getTime();
    if (now - lastSeen > TOUCH_INTERVAL_MS) {
      lastSeen = now;
      await this.prisma.client.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastSeenAt: new Date(now) },
      });
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
      },
      session: {
        id: session.id,
        csrfToken: session.csrfToken,
        createdAt: session.createdAt,
        expiresAt: new Date(
          Math.min(session.expiresAt.getTime(), lastSeen + this.idleMs),
        ),
      },
    };
  }

  /** Revoca una sesión (idempotente: no reescribe una ya revocada). */
  async revoke(
    sessionId: string,
    reason: SessionRevocationReason,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma.client;
    const { count } = await client.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
    return count > 0;
  }

  /** Revoca por el valor de la cookie (para rotación al iniciar sesión). */
  async revokeByToken(
    token: string,
    reason: SessionRevocationReason,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!TOKEN_PATTERN.test(token)) return;
    await tx.session.updateMany({
      where: { tokenHash: sha256Hex(token), revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
  }

  /** Revoca todas las sesiones vigentes de un usuario. Devuelve cuántas. */
  async revokeAllForUser(
    userId: string,
    reason: SessionRevocationReason,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma.client;
    const { count } = await client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
    return count;
  }

  /** Sesiones vigentes del usuario (sin exponer hashes ni tokens). */
  async listActive(userId: string): Promise<ActiveSessionInfo[]> {
    const now = new Date();
    const rows = await this.prisma.client.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        lastSeenAt: { gt: new Date(now.getTime() - this.idleMs) },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        userAgent: true,
      },
    });
    return rows;
  }

  /** Elimina sesiones e intentos fallidos antiguos. */
  async purgeExpired(): Promise<{ sessions: number; loginFailures: number }> {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const [sessions, loginFailures] = await this.prisma.client.$transaction([
      this.prisma.client.session.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
        },
      }),
      this.prisma.client.loginFailure.deleteMany({
        where: {
          createdAt: { lt: new Date(Date.now() - 2 * this.loginWindowMs) },
        },
      }),
    ]);
    return { sessions: sessions.count, loginFailures: loginFailures.count };
  }
}
