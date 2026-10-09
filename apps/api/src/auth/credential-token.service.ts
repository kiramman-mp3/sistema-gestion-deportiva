import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/config.module.js';
import type {
  CredentialTokenKind,
  Prisma,
} from '../generated/prisma/client.js';
import { sha256Hex } from './security-hash.service.js';

/** Igual que los identificadores de sesión: 32 bytes aleatorios en base64url. */
export const CREDENTIAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface IssuedCredentialToken {
  /** Valor en claro: solo existe en este instante; en BD queda su SHA-256. */
  token: string;
  kind: CredentialTokenKind;
  expiresAt: Date;
}

/**
 * Enlaces de un solo uso para establecer una contraseña (activación de una cuenta
 * nueva o restablecimiento). No hay entrega por correo: el administrador que lo
 * emite recibe el token una única vez y debe hacerlo llegar al titular por un
 * canal de confianza. Ver docs/authentication.md.
 */
@Injectable()
export class CredentialTokenService {
  private readonly ttlMs: number;

  constructor(@Inject(ENV) env: Env) {
    this.ttlMs = env.CREDENTIAL_LINK_TTL_HOURS * 3_600_000;
  }

  /** Emite un token nuevo y anula los pendientes del mismo usuario (solo uno vigente). */
  async issue(
    tx: Prisma.TransactionClient,
    params: { userId: string; kind: CredentialTokenKind; createdById: string },
  ): Promise<IssuedCredentialToken> {
    await this.revokeOutstanding(tx, params.userId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await tx.credentialToken.create({
      data: {
        userId: params.userId,
        kind: params.kind,
        tokenHash: sha256Hex(token),
        createdById: params.createdById,
        expiresAt,
      },
    });
    return { token, kind: params.kind, expiresAt };
  }

  async revokeOutstanding(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const { count } = await tx.credentialToken.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  /**
   * Canjea un token: lo marca como usado de forma atómica (un `UPDATE` condicional,
   * por lo que dos canjes simultáneos no pueden tener éxito a la vez). Devuelve
   * `null` si no existe, ya se usó, fue anulado o caducó, sin distinguir el motivo.
   */
  async consume(
    tx: Prisma.TransactionClient,
    token: string,
  ): Promise<{ userId: string; kind: CredentialTokenKind } | null> {
    if (!CREDENTIAL_TOKEN_PATTERN.test(token)) return null;
    const tokenHash = sha256Hex(token);
    const { count } = await tx.credentialToken.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (count === 0) return null;
    const row = await tx.credentialToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { userId: true, kind: true },
    });
    return row;
  }
}
