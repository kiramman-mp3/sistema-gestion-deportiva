import { createHash, createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/config.module.js';

/** SHA-256 en hexadecimal. Para valores de alta entropía (tokens de sesión). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Hash con clave (HMAC-SHA256) para datos de baja entropía como IP o correo:
 * sin la clave del servidor no se pueden reconstruir por fuerza bruta.
 * El `scope` separa dominios para que el mismo valor no produzca el mismo hash.
 */
@Injectable()
export class SecurityHashService {
  private readonly key: string;

  constructor(@Inject(ENV) env: Env) {
    this.key = env.SECURITY_HASH_KEY;
  }

  hash(scope: string, value: string): string {
    return createHmac('sha256', this.key)
      .update(`${scope}\u0000${value}`)
      .digest('hex');
  }
}
