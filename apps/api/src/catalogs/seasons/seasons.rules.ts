import type { SeasonStatus } from '../../generated/prisma/client.js';

/**
 * Transiciones de estado permitidas. PROVISIONALES: `requirements.md` no define
 * el ciclo de vida de una temporada; es la secuencia natural
 * (borrador → activa → finalizada → archivada) con dos reversiones de corrección.
 * Pendiente de confirmar con la Liga (ver docs/decisions.md).
 */
export const SEASON_TRANSITIONS: Record<SeasonStatus, readonly SeasonStatus[]> =
  {
    borrador: ['activa'],
    activa: ['finalizada'],
    finalizada: ['archivada', 'activa'],
    archivada: ['finalizada'],
  };

export function canTransition(from: SeasonStatus, to: SeasonStatus): boolean {
  return SEASON_TRANSITIONS[from].includes(to);
}

/** Solo las temporadas en borrador pueden eliminarse; el resto conserva su historial. */
export const DELETABLE_SEASON_STATUS: SeasonStatus = 'borrador';

/** Una temporada archivada es de solo lectura. */
export const READ_ONLY_SEASON_STATUS: SeasonStatus = 'archivada';

/** Fecha de calendario `YYYY-MM-DD` válida (rechaza p. ej. 2026-02-30). */
export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function seasonRangeError(
  startDate: string,
  endDate: string,
): string | null {
  // Las fechas ISO `YYYY-MM-DD` se ordenan lexicográficamente.
  return endDate > startDate
    ? null
    : 'La fecha de fin debe ser posterior a la de inicio';
}

export const toDate = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);
export const fromDate = (value: Date): string =>
  value.toISOString().slice(0, 10);
