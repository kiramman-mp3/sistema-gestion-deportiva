import { Inject, Injectable } from '@nestjs/common';
import { athleteCode } from '../athletes/athletes.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { ageOn, todayInGuayaquil } from '../people/people.schemas.js';

/**
 * Cómo se nombra a un deportista en lo que ve el público.
 *
 * - Un **adulto** (18 años o más) aparece por su nombre: competir implica que los resultados son públicos.
 * - Un **menor**, o alguien cuya edad se desconoce, aparece como «Deportista DEP-000123» salvo que su
 *   perfil público esté activado y tenga un consentimiento vigente de publicación de perfil (§10.2).
 *
 * Los usuarios autorizados ven siempre los nombres completos en las pantallas y documentos con sesión.
 */
@Injectable()
export class PublicNamesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async labels(athleteIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(athleteIds)];
    const result = new Map<string, string>();
    if (ids.length === 0) return result;

    const now = Date.now();
    const today = todayInGuayaquil();
    const rows = await this.prisma.client.athlete.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        codeNumber: true,
        publicProfile: true,
        person: {
          select: {
            firstName: true,
            lastName: true,
            birthDate: true,
            status: true,
            consents: {
              where: { type: 'publicacion_perfil', status: 'otorgado' },
              select: { expiresAt: true },
            },
          },
        },
      },
    });
    for (const a of rows) {
      const birth = a.person.birthDate?.toISOString().slice(0, 10);
      const adult = birth !== undefined && ageOn(birth, today) >= 18;
      const consented =
        a.publicProfile &&
        a.person.status === 'activo' &&
        a.person.consents.some(
          (c) => !c.expiresAt || c.expiresAt.getTime() > now,
        );
      result.set(
        a.id,
        adult || consented
          ? `${a.person.firstName} ${a.person.lastName}`
          : `Deportista ${athleteCode(a.codeNumber)}`,
      );
    }
    return result;
  }
}
