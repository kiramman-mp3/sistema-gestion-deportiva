import { hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

/**
 * Argon2id con los parámetros mínimos recomendados por OWASP
 * (19 MiB de memoria, 2 iteraciones, 1 hilo). El algoritmo por defecto de
 * `@node-rs/argon2` es Argon2id; la sal es aleatoria y va dentro del hash.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /**
   * Verifica una contraseña. Si no hay hash (usuario inexistente) compara
   * contra uno ficticio para que el tiempo de respuesta no delate si la
   * cuenta existe.
   */
  async verify(storedHash: string | null, password: string): Promise<boolean> {
    if (storedHash === null) {
      this.dummyHash ??= this.hash('contraseña-ficticia-para-igualar-tiempos');
      await verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    try {
      return await verify(storedHash, password);
    } catch {
      // Hash corrupto o con formato inválido: se trata como credencial incorrecta.
      return false;
    }
  }
}
