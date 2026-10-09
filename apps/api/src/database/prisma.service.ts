import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../config/config.module.js';
import { createPrismaClient } from './prisma-client.js';

/**
 * Acceso a la base de datos. Se expone el cliente por composición para no
 * heredar de una clase generada.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: ReturnType<typeof createPrismaClient>;

  constructor(@Inject(ENV) env: Env) {
    this.client = createPrismaClient(env.DATABASE_URL);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
