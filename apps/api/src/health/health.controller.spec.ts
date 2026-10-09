import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service.js';
import { HealthController } from './health.controller.js';

function controllerWith(queryRaw: () => Promise<unknown>) {
  const prisma = {
    client: { $queryRaw: queryRaw },
  } as unknown as PrismaService;
  return new HealthController(prisma);
}

describe('HealthController', () => {
  it('informa que el servicio está operativo sin consultar la base de datos', () => {
    const queryRaw = vi.fn();
    const result = controllerWith(queryRaw).check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('liga-api');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('ready responde ok si la base de datos contesta', async () => {
    const result = await controllerWith(() => Promise.resolve([1])).ready();
    expect(result.status).toBe('ok');
  });

  it('ready devuelve 503 sin exponer detalles si la base de datos falla', async () => {
    const controller = controllerWith(() =>
      Promise.reject(new Error('password authentication failed for user liga')),
    );
    const error = await controller.ready().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(
      JSON.stringify((error as ServiceUnavailableException).getResponse()),
    ).not.toContain('password');
  });
});
