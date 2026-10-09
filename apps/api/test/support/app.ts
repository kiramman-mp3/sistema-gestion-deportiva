import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { ENV } from '../../src/config/config.module.js';
import { type Env, loadEnv } from '../../src/config/env.js';

export const TEST_ORIGIN = 'https://liga.example';

/** Logger que conserva todo lo que la aplicación escribe, para auditar fugas de secretos. */
export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];
  private push(message: unknown, optional: unknown[]) {
    this.lines.push(
      [message, ...optional]
        .map((part) =>
          part instanceof Error
            ? `${part.message}\n${part.stack}`
            : String(part),
        )
        .join(' '),
    );
  }
  log(message: unknown, ...optional: unknown[]) {
    this.push(message, optional);
  }
  error(message: unknown, ...optional: unknown[]) {
    this.push(message, optional);
  }
  warn(message: unknown, ...optional: unknown[]) {
    this.push(message, optional);
  }
  debug(message: unknown, ...optional: unknown[]) {
    this.push(message, optional);
  }
  verbose(message: unknown, ...optional: unknown[]) {
    this.push(message, optional);
  }
  get text(): string {
    return this.lines.join('\n');
  }
}

export interface TestApp {
  app: NestExpressApplication;
  env: Env;
  logger: CapturingLogger;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(
  options: {
    env?: Record<string, string>;
    customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
    extraControllers?: unknown[];
  } = {},
): Promise<TestApp> {
  const env = loadEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    SECURITY_HASH_KEY: process.env.SECURITY_HASH_KEY,
    WEB_ORIGIN: TEST_ORIGIN,
    NODE_ENV: 'test',
    ...options.env,
  });
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: (options.extraControllers ?? []) as never[],
  })
    .overrideProvider(ENV)
    .useValue(env);
  if (options.customize) builder = options.customize(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  const logger = new CapturingLogger();
  app.useLogger(logger);
  configureApp(app, env);
  await app.init();
  return {
    app,
    env,
    logger,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** Valores de las cabeceras Set-Cookie de una respuesta. */
export function setCookies(res: {
  headers: Record<string, unknown>;
}): string[] {
  const header = res.headers['set-cookie'];
  if (Array.isArray(header)) return header as string[];
  return typeof header === 'string' ? [header] : [];
}

/** Extrae el valor `nombre=valor` (sin atributos) de la cookie indicada. */
export function cookieValue(
  res: { headers: Record<string, unknown> },
  name: string,
): string | undefined {
  const found = setCookies(res).find((c) => c.startsWith(`${name}=`));
  return found?.split(';')[0]?.slice(name.length + 1);
}
