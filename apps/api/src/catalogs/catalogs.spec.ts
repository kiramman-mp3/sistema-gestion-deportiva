import { ConflictException } from '@nestjs/common';
import {
  changedFields,
  codeSchema,
  dbErrorInfo,
  escapeLike,
  listQuerySchema,
  nameSchema,
  normalizeName,
  translateDbError,
} from './common.js';
import {
  ageRangeError,
  createCategorySchema,
  updateCategorySchema,
} from './categories/categories.schemas.js';
import {
  SEASON_TRANSITIONS,
  canTransition,
  fromDate,
  isValidCalendarDate,
  seasonRangeError,
  toDate,
} from './seasons/seasons.rules.js';
import {
  createSeasonSchema,
  seasonStatusSchema,
} from './seasons/seasons.schemas.js';

describe('utilidades comunes de catálogos', () => {
  it('normaliza el nombre (recorte y espacios internos)', () => {
    expect(normalizeName('  Liga   A \t')).toBe('Liga A');
    expect(nameSchema.parse('  Bás   quet ')).toBe('Bás quet');
    expect(nameSchema.safeParse('   ').success).toBe(false);
    expect(nameSchema.safeParse('x'.repeat(101)).success).toBe(false);
    expect(nameSchema.safeParse(5).success).toBe(false);
  });

  it('valida el formato del código', () => {
    for (const ok of ['futbol', 'liga_a', 'sub15', 'ab'])
      expect(codeSchema.safeParse(ok).success, ok).toBe(true);
    for (const bad of [
      '',
      'a',
      'Liga',
      '1liga',
      'liga a',
      'liga-a',
      'ñandú',
      'x'.repeat(41),
    ]) {
      expect(codeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('escapa los comodines de LIKE y la barra invertida', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('texto normal')).toBe('texto normal');
  });

  it('valida y acota la paginación', () => {
    expect(listQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      q: undefined,
    });
    expect(
      listQuerySchema.parse({ page: '3', pageSize: '50', q: ' fut ' }),
    ).toEqual({ page: 3, pageSize: 50, q: 'fut' });
    expect(listQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
    for (const bad of [
      { page: '0' },
      { page: 'x' },
      { pageSize: '101' },
      { pageSize: '0' },
      { page: '1.5' },
    ]) {
      expect(listQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });

  it('changedFields devuelve solo lo que cambió, o null', () => {
    expect(changedFields({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({
      before: { b: 2 },
      after: { b: 3 },
    });
    expect(changedFields({ a: 1 }, { a: 1 })).toBeNull();
    expect(changedFields({ a: 1 as number | null }, { a: null })).toEqual({
      before: { a: 1 },
      after: { a: null },
    });
  });

  describe('traducción de errores de base de datos', () => {
    const dbError = (originalCode: string, index?: string) => ({
      meta: {
        driverAdapterError: {
          cause: { originalCode, constraint: index ? { index } : undefined },
        },
      },
    });
    const messages = {
      unique: { sports_code_key: 'código repetido' },
      inUse: 'en uso',
    };

    it('extrae SQLSTATE y restricción', () => {
      expect(dbErrorInfo(dbError('23505', 'sports_code_key'))).toEqual({
        sqlState: '23505',
        constraint: 'sports_code_key',
      });
      expect(dbErrorInfo(new Error('otro'))).toEqual({
        sqlState: undefined,
        constraint: undefined,
      });
      expect(dbErrorInfo(null)).toEqual({
        sqlState: undefined,
        constraint: undefined,
      });
    });

    it('unicidad y claves foráneas se convierten en 409', () => {
      expect(() =>
        translateDbError(dbError('23505', 'sports_code_key'), messages),
      ).toThrow(new ConflictException('código repetido'));
      expect(() =>
        translateDbError(dbError('23505', 'desconocida'), messages),
      ).toThrow('Ya existe un registro con esos datos');
      expect(() => translateDbError(dbError('23503'), messages)).toThrow(
        new ConflictException('en uso'),
      );
      expect(() => translateDbError(dbError('23001'), messages)).toThrow(
        new ConflictException('en uso'),
      );
    });

    it('relanza cualquier otro error sin transformarlo', () => {
      const unexpected = new Error('conexión caída');
      expect(() => translateDbError(unexpected, messages)).toThrow(unexpected);
      const check = dbError('23514');
      let thrown: unknown;
      try {
        translateDbError(check, messages);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(check);
    });
  });
});

describe('categorías: rangos de edad', () => {
  it('ageRangeError solo se queja si ambos existen y están invertidos', () => {
    expect(ageRangeError(10, 12)).toBeNull();
    expect(ageRangeError(10, 10)).toBeNull();
    expect(ageRangeError(null, 5)).toBeNull();
    expect(ageRangeError(5, undefined)).toBeNull();
    expect(ageRangeError(null, null)).toBeNull();
    expect(ageRangeError(13, 12)).toBe(
      'La edad máxima no puede ser menor que la mínima',
    );
  });

  it('el esquema de creación valida tipos, límites y coherencia', () => {
    const base = { code: 'sub15', name: 'Sub 15' };
    expect(createCategorySchema.safeParse(base).success).toBe(true);
    expect(
      createCategorySchema.safeParse({ ...base, ageMin: 0, ageMax: 120 })
        .success,
    ).toBe(true);
    for (const bad of [
      { ageMin: -1 },
      { ageMax: 121 },
      { ageMin: 1.5 },
      { ageMin: '5' },
      { ageMin: 15, ageMax: 10 },
      { sortOrder: -1 },
      { extra: 1 },
    ]) {
      expect(
        createCategorySchema.safeParse({ ...base, ...bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it('la actualización exige algún campo, admite null y prohíbe el código', () => {
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
    expect(updateCategorySchema.safeParse({ ageMax: null }).success).toBe(true);
    expect(updateCategorySchema.safeParse({ code: 'otro' }).success).toBe(
      false,
    );
    expect(updateCategorySchema.safeParse({ status: 'inactivo' }).success).toBe(
      false,
    );
  });
});

describe('temporadas: fechas y estados', () => {
  it('valida fechas de calendario reales', () => {
    for (const ok of ['2026-03-01', '2028-02-29', '2026-12-31'])
      expect(isValidCalendarDate(ok), ok).toBe(true);
    for (const bad of [
      '2026-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-3-1',
      '01/03/2026',
      '',
      '2026-03-01T00:00:00Z',
    ]) {
      expect(isValidCalendarDate(bad), bad).toBe(false);
    }
  });

  it('convierte fechas sin desplazamientos de zona horaria', () => {
    for (const day of ['2026-03-01', '2026-12-31', '2028-02-29'])
      expect(fromDate(toDate(day))).toBe(day);
    expect(toDate('2026-03-01').toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('exige que el fin sea posterior al inicio', () => {
    expect(seasonRangeError('2026-03-01', '2026-03-02')).toBeNull();
    expect(seasonRangeError('2026-03-01', '2026-03-01')).not.toBeNull();
    expect(seasonRangeError('2026-03-01', '2026-02-28')).not.toBeNull();
    expect(seasonRangeError('2025-12-31', '2026-01-01')).toBeNull();
  });

  it('el esquema de creación no admite estado ni campos desconocidos', () => {
    const ok = {
      name: 'T 2026',
      startDate: '2026-03-01',
      endDate: '2026-11-30',
    };
    expect(createSeasonSchema.safeParse(ok).success).toBe(true);
    expect(
      createSeasonSchema.safeParse({ ...ok, status: 'activa' }).success,
    ).toBe(false);
    expect(
      createSeasonSchema.safeParse({ ...ok, endDate: '2026-03-01' }).success,
    ).toBe(false);
  });

  it('el cambio de estado exige motivo y un estado conocido', () => {
    expect(
      seasonStatusSchema.safeParse({ status: 'activa', reason: 'Inicio' })
        .success,
    ).toBe(true);
    expect(seasonStatusSchema.safeParse({ status: 'activa' }).success).toBe(
      false,
    );
    expect(
      seasonStatusSchema.safeParse({ status: 'otra', reason: 'Inicio' })
        .success,
    ).toBe(false);
  });

  it('las transiciones forman el ciclo previsto y no permiten saltos', () => {
    expect(canTransition('borrador', 'activa')).toBe(true);
    expect(canTransition('activa', 'finalizada')).toBe(true);
    expect(canTransition('finalizada', 'archivada')).toBe(true);
    expect(canTransition('finalizada', 'activa')).toBe(true);
    expect(canTransition('archivada', 'finalizada')).toBe(true);
    for (const [from, to] of [
      ['borrador', 'finalizada'],
      ['borrador', 'archivada'],
      ['activa', 'archivada'],
      ['activa', 'borrador'],
      ['archivada', 'activa'],
      ['archivada', 'borrador'],
      ['finalizada', 'borrador'],
    ] as const) {
      expect(canTransition(from, to), `${from} → ${to}`).toBe(false);
    }
    // Ningún estado puede volver a «borrador»: un borrador solo se crea o se elimina
    expect(Object.values(SEASON_TRANSITIONS).flat()).not.toContain('borrador');
  });
});
