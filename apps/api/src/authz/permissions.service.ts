import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class PermissionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Permisos efectivos de un usuario: unión de los de todos sus roles, leídos
   * de la base de datos en cada llamada. No hay caché, así que un cambio de
   * roles o permisos se aplica en la siguiente petición.
   */
  async forUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Set<string>> {
    const client = tx ?? this.prisma.client;
    const rows = await client.permission.findMany({
      where: { roles: { some: { role: { users: { some: { userId } } } } } },
      select: { code: true },
    });
    return new Set(rows.map((row) => row.code));
  }
}
