import { normalizeKey } from '../common/keys.js';

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  agresion_fisica: 'agresión física',
  agresion_verbal: 'agresión verbal',
  conducta_antideportiva: 'conducta antideportiva',
  invasion_campo: 'invasión del campo',
  alineacion_indebida: 'alineación indebida',
  no_presentacion: 'no presentación',
  otro: 'otra',
};

export const SANCTION_TYPE_LABELS: Record<string, string> = {
  amonestacion: 'amonestación',
  suspension_partidos: 'suspensión por partidos',
  suspension_temporal: 'suspensión temporal',
  descuento_puntos: 'descuento de puntos',
  descalificacion: 'descalificación',
  multa: 'multa',
};

/** Código visible de un expediente: `EXP-000123`. */
export const caseCode = (caseNumber: number) =>
  `EXP-${String(caseNumber).padStart(6, '0')}`;

/** Parte `AAAA-MM-DD` de hoy en la zona horaria de la Liga. */
export function todayDate(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
  }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Una sanción rige hoy si está vigente y hoy cae dentro de su período. */
export function isSanctionActive(
  sanction: { status: string; startsAt: Date; endsAt: Date | null },
  today = todayDate(),
): boolean {
  return (
    sanction.status === 'vigente' &&
    sanction.startsAt.getTime() <= today.getTime() &&
    (sanction.endsAt === null || sanction.endsAt.getTime() >= today.getTime())
  );
}

/**
 * Red de seguridad antes de publicar: el texto del portal no debe mencionar por nombre a ningún
 * deportista vinculado al expediente (menores incluidos). Es un control de mejor esfuerzo; la
 * responsabilidad de redactar sin datos personales sigue siendo de quien publica.
 */
export function mentionsAnyName(
  text: string,
  people: { firstName: string; lastName: string }[],
): string | null {
  const haystack = ` ${normalizeKey(text)} `;
  for (const p of people) {
    const first = normalizeKey(p.firstName);
    const last = normalizeKey(p.lastName);
    if (!first || !last) continue;
    if (
      haystack.includes(` ${first} ${last} `) ||
      haystack.includes(` ${last} ${first} `)
    ) {
      return `${p.firstName} ${p.lastName}`;
    }
  }
  return null;
}
