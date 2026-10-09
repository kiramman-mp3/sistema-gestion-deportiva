import { normalizeIdNumber, normalizeKey, slugify } from '../common/keys.js';
import {
  ageOn,
  birthDateSchema,
  isValidEcuadorianCedula,
  todayInGuayaquil,
} from './people.schemas.js';
import { idKeyOf } from './persons.service.js';

describe('claves normalizadas', () => {
  it('ignoran mayúsculas, tildes, signos y espacios repetidos', () => {
    expect(normalizeKey('  Atlético   Quero! ')).toBe('atletico quero');
    expect(normalizeKey('ATLETICO-QUERO')).toBe(normalizeKey('Atlético Quero'));
    expect(normalizeKey('Ñandú FC')).toBe('nandu fc');
    expect(normalizeKey('!!!')).toBe('');
  });

  it('generan identificadores aptos para direcciones', () => {
    expect(slugify('Deportivo Quero')).toBe('deportivo-quero');
    expect(slugify('  Club  Ñ & Ç  ')).toBe('club-n-c');
    expect(slugify('Liga A (2026)')).toBe('liga-a-2026');
  });

  it('normalizan documentos de identidad', () => {
    expect(normalizeIdNumber(' 171003-4065 ')).toBe('1710034065');
    expect(normalizeIdNumber('ab-123.456')).toBe('AB123456');
    expect(idKeyOf('cedula', '171.003.4065')).toBe('cedula:1710034065');
    // El mismo número con otro tipo de documento es otra clave
    expect(idKeyOf('pasaporte', '1710034065')).not.toBe(
      idKeyOf('cedula', '1710034065'),
    );
  });
});

/** Completa 9 dígitos con su verificador (módulo 10), independiente de la implementación. */
function withCheckDigit(first9: string): string {
  const sum = [...first9].reduce((acc, ch, i) => {
    let n = Number(ch) * (i % 2 === 0 ? 2 : 1);
    if (n > 9) n -= 9;
    return acc + n;
  }, 0);
  return first9 + String((10 - (sum % 10)) % 10);
}

describe('cédula ecuatoriana', () => {
  it('acepta cédulas con verificador correcto', () => {
    for (const ok of [
      '1710034065',
      withCheckDigit('010203040'),
      withCheckDigit('171317507'),
      withCheckDigit('240000001'),
    ]) {
      expect(isValidEcuadorianCedula(ok), ok).toBe(true);
    }
  });

  it('rechaza verificador incorrecto, provincia inexistente, tercer dígito ≥ 6 y formatos inválidos', () => {
    for (const bad of [
      '1710034060',
      '1710034066',
      '9910034065',
      '0010034065',
      '2510034065',
      '1760034065',
      '171003406',
      '17100340655',
      'abcdefghij',
      '',
      '17 10034065',
    ]) {
      expect(isValidEcuadorianCedula(bad), bad).toBe(false);
    }
  });

  it('acepta provincia 30 (ecuatorianos en el exterior)', () => {
    let sum = 0;
    const first9 = '301003406';
    for (let i = 0; i < 9; i++) {
      let n = Number(first9[i]) * (i % 2 === 0 ? 2 : 1);
      if (n > 9) n -= 9;
      sum += n;
    }
    expect(
      isValidEcuadorianCedula(first9 + String((10 - (sum % 10)) % 10)),
    ).toBe(true);
  });
});

describe('fechas y edades', () => {
  it('calcula la edad cumplida en una fecha de referencia', () => {
    expect(ageOn('2010-06-15', '2026-06-14')).toBe(15);
    expect(ageOn('2010-06-15', '2026-06-15')).toBe(16);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
    expect(ageOn('2026-01-01', '2026-12-31')).toBe(0);
  });

  it('la fecha de hoy se toma en la zona horaria de Ecuador', () => {
    // 2026-03-01 03:00 UTC sigue siendo 28 de febrero en Guayaquil (UTC-5)
    expect(todayInGuayaquil(new Date('2026-03-01T03:00:00Z'))).toBe(
      '2026-02-28',
    );
    expect(todayInGuayaquil(new Date('2026-03-01T06:00:00Z'))).toBe(
      '2026-03-01',
    );
  });

  it('rechaza fechas de nacimiento futuras, imposibles o anteriores a 1900', () => {
    expect(birthDateSchema.safeParse('2010-05-20').success).toBe(true);
    for (const bad of [
      '2999-01-01',
      '1899-12-31',
      '2010-02-30',
      '20/05/2010',
      '',
    ]) {
      expect(birthDateSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});
