import { Global, Module } from '@nestjs/common';
import { type Env, loadEnv } from './env.js';

/** Token de inyección de la configuración validada. */
export const ENV = 'ENV';
export type { Env };

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
