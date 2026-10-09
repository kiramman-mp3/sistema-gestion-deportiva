/**
 * Claves normalizadas para detectar duplicados evidentes: minúsculas, sin tildes,
 * sin signos y con espacios colapsados («Deportivo  Quero!» = «deportivo quero»).
 * Se guardan en columnas únicas, de modo que la base de datos —no solo el servicio—
 * rechaza los duplicados, incluso entre solicitudes simultáneas.
 */
export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Identificador apto para direcciones: `club-deportivo-quero`. */
export function slugify(value: string): string {
  return normalizeKey(value).replace(/ /g, '-');
}

/** Documento de identidad normalizado: solo letras y números, en mayúsculas. */
export function normalizeIdNumber(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}
