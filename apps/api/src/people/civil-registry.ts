/** Persona relacionada (cónyuge, padre o madre) según el Registro Civil. */
export interface CivilRegistryRelative {
  name: string;
  idNumber: string | null;
  birthPlace: string | null;
}

/** Datos que el Registro Civil puede entregar para una cédula. */
export interface CivilRegistryRecord {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  birthPlace: string | null;
  spouse: CivilRegistryRelative | null;
  father: CivilRegistryRelative | null;
  mother: CivilRegistryRelative | null;
}

/**
 * Consulta de identidad por cédula. No hay fuente pública gratuita: el acceso oficial
 * requiere un convenio con la DINARDAP. Al firmarlo, se implementa esta interfaz y se
 * registra en `PeopleModule` en lugar de `UnconfiguredCivilRegistry`.
 */
export interface CivilRegistry {
  readonly configured: boolean;
  findByCedula(cedula: string): Promise<CivilRegistryRecord | null>;
}

export const CIVIL_REGISTRY = Symbol('CIVIL_REGISTRY');

export class UnconfiguredCivilRegistry implements CivilRegistry {
  readonly configured = false;
  findByCedula(): Promise<CivilRegistryRecord | null> {
    return Promise.resolve(null);
  }
}
