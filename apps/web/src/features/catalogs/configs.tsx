import type { CatalogConfig, Errors, Values } from './types.ts';

// ───────────────────────────── utilidades ─────────────────────────────

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const CATALOG_STATUS_LABELS: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
};
const SEASON_STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  activa: 'Activa',
  finalizada: 'Finalizada',
  archivada: 'Archivada',
};

/** Indicador de estado: el texto y el símbolo acompañan siempre al color. */
function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'ok' | 'off' | 'neutral';
}) {
  const symbol = tone === 'ok' ? '●' : tone === 'off' ? '○' : '◐';
  return (
    <span className={`badge badge-${tone}`}>
      <span aria-hidden="true">{symbol} </span>
      {label}
    </span>
  );
}

const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

function validateName(value: string, errors: Errors) {
  const name = collapse(value);
  if (!name) errors.name = 'Ingrese el nombre.';
  else if (name.length > 100)
    errors.name = 'El nombre no puede superar 100 caracteres.';
}

function validateCode(value: string, errors: Errors) {
  const code = value.trim();
  if (!code) errors.code = 'Ingrese el código.';
  else if (code.length < 2 || code.length > 40)
    errors.code = 'El código debe tener entre 2 y 40 caracteres.';
  else if (!CODE_PATTERN.test(code)) {
    errors.code =
      'Use minúsculas, números y guion bajo, empezando con una letra.';
  }
}

/** `AAAA-MM-DD` → `DD/MM/AAAA` sin pasar por Date (evita desplazamientos de zona horaria). */
export function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Entero opcional en un rango; devuelve `null` si el campo está vacío. */
function optionalInt(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

// ───────────────────────────── deportes ─────────────────────────────

export interface Sport {
  id: string;
  code: string;
  name: string;
  status: 'activo' | 'inactivo';
}

export const sportsConfig: CatalogConfig<Sport> = {
  path: '/sports',
  title: 'Deportes',
  newLabel: 'Nuevo deporte',
  editTitle: (s) => `Editar deporte: ${s.name}`,
  itemName: (s) => `Deporte «${s.name}»`,
  emptyText: 'Todavía no hay deportes registrados.',
  searchLabel: 'Buscar por nombre o código',
  permissions: {
    read: 'sports:read',
    manage: 'sports:manage',
    delete: 'sports:delete',
  },
  statusFilter: [
    { value: 'activo', label: 'Activo' },
    { value: 'inactivo', label: 'Inactivo' },
  ],
  statusLabel: (s) => CATALOG_STATUS_LABELS[s] ?? s,
  columns: [
    { header: 'Nombre', render: (s) => s.name },
    { header: 'Código', render: (s) => <code>{s.code}</code> },
    {
      header: 'Estado',
      render: (s) => (
        <StatusBadge
          label={CATALOG_STATUS_LABELS[s.status] ?? s.status}
          tone={s.status === 'activo' ? 'ok' : 'off'}
        />
      ),
    },
  ],
  fields: [
    {
      name: 'code',
      label: 'Código',
      type: 'text',
      required: true,
      createOnly: true,
      maxLength: 40,
      hint: 'Identificador estable: minúsculas, números y guion bajo (p. ej. futbol).',
    },
    {
      name: 'name',
      label: 'Nombre',
      type: 'text',
      required: true,
      maxLength: 100,
    },
  ],
  initialValues: (s) => ({ code: s?.code ?? '', name: s?.name ?? '' }),
  validate: (v, mode) => {
    const errors: Errors = {};
    if (mode === 'create') validateCode(v.code ?? '', errors);
    validateName(v.name ?? '', errors);
    return errors;
  },
  toPayload: (v, mode) =>
    mode === 'create'
      ? { code: (v.code ?? '').trim(), name: collapse(v.name ?? '') }
      : { name: collapse(v.name ?? '') },
  statusActions: (s) =>
    s.status === 'activo'
      ? [
          {
            label: 'Desactivar',
            status: 'inactivo',
            description:
              'El deporte dejará de estar disponible para nuevas competencias, pero se conservan sus datos e historial.',
            reason: 'optional',
          },
        ]
      : [
          {
            label: 'Activar',
            status: 'activo',
            description: 'El deporte volverá a estar disponible.',
            reason: 'optional',
          },
        ],
  canDelete: () => true,
  deleteDescription: (s) =>
    `Se eliminará «${s.name}» de forma permanente. Si ya está en uso, el sistema no lo permitirá y deberá desactivarlo. Esta acción no se puede deshacer.`,
};

// ───────────────────────────── categorías ─────────────────────────────

export interface Category {
  id: string;
  code: string;
  name: string;
  ageMin: number | null;
  ageMax: number | null;
  sortOrder: number;
  status: 'activo' | 'inactivo';
}

function ageText(c: Category): string {
  if (c.ageMin !== null && c.ageMax !== null)
    return c.ageMin === c.ageMax
      ? `${c.ageMin} años`
      : `${c.ageMin} a ${c.ageMax} años`;
  if (c.ageMin !== null) return `Desde ${c.ageMin} años`;
  if (c.ageMax !== null) return `Hasta ${c.ageMax} años`;
  return 'Sin definir';
}

function validateAge(
  values: Values,
  field: 'ageMin' | 'ageMax',
  label: string,
  errors: Errors,
) {
  const raw = (values[field] ?? '').trim();
  if (raw === '') return;
  const n = Number(raw);
  if (!Number.isInteger(n))
    errors[field] = `${label}: ingrese un número entero.`;
  else if (n < 0) errors[field] = `${label}: no puede ser negativa.`;
  else if (n > 120) errors[field] = `${label}: máximo 120.`;
}

export const categoriesConfig: CatalogConfig<Category> = {
  path: '/categories',
  title: 'Categorías',
  newLabel: 'Nueva categoría',
  editTitle: (c) => `Editar categoría: ${c.name}`,
  itemName: (c) => `Categoría «${c.name}»`,
  emptyText: 'Todavía no hay categorías registradas.',
  searchLabel: 'Buscar por nombre o código',
  permissions: {
    read: 'categories:read',
    manage: 'categories:manage',
    delete: 'categories:delete',
  },
  statusFilter: [
    { value: 'activo', label: 'Activa' },
    { value: 'inactivo', label: 'Inactiva' },
  ],
  statusLabel: (s) => (s === 'activo' ? 'Activa' : 'Inactiva'),
  columns: [
    { header: 'Orden', render: (c) => c.sortOrder },
    { header: 'Nombre', render: (c) => c.name },
    { header: 'Código', render: (c) => <code>{c.code}</code> },
    { header: 'Edad', render: ageText },
    {
      header: 'Estado',
      render: (c) => (
        <StatusBadge
          label={c.status === 'activo' ? 'Activa' : 'Inactiva'}
          tone={c.status === 'activo' ? 'ok' : 'off'}
        />
      ),
    },
  ],
  fields: [
    {
      name: 'code',
      label: 'Código',
      type: 'text',
      required: true,
      createOnly: true,
      maxLength: 40,
      hint: 'Identificador estable: minúsculas, números y guion bajo (p. ej. liga_a).',
    },
    {
      name: 'name',
      label: 'Nombre',
      type: 'text',
      required: true,
      maxLength: 100,
    },
    {
      name: 'ageMin',
      label: 'Edad mínima (opcional)',
      type: 'number',
      min: 0,
      max: 120,
      hint: 'Déjela vacía si la Liga aún no ha definido un límite.',
    },
    {
      name: 'ageMax',
      label: 'Edad máxima (opcional)',
      type: 'number',
      min: 0,
      max: 120,
    },
    {
      name: 'sortOrder',
      label: 'Orden de presentación',
      type: 'number',
      min: 0,
      max: 9999,
      hint: 'Las categorías se ordenan de menor a mayor.',
    },
  ],
  initialValues: (c) => ({
    code: c?.code ?? '',
    name: c?.name ?? '',
    ageMin: c?.ageMin?.toString() ?? '',
    ageMax: c?.ageMax?.toString() ?? '',
    sortOrder: c?.sortOrder?.toString() ?? '0',
  }),
  validate: (v, mode) => {
    const errors: Errors = {};
    if (mode === 'create') validateCode(v.code ?? '', errors);
    validateName(v.name ?? '', errors);
    validateAge(v, 'ageMin', 'Edad mínima', errors);
    validateAge(v, 'ageMax', 'Edad máxima', errors);
    if (!errors.ageMin && !errors.ageMax) {
      const min = optionalInt(v.ageMin ?? '');
      const max = optionalInt(v.ageMax ?? '');
      if (min !== null && max !== null && min > max) {
        errors.ageMax = 'La edad máxima no puede ser menor que la mínima.';
      }
    }
    const order = (v.sortOrder ?? '').trim();
    if (
      order !== '' &&
      (!Number.isInteger(Number(order)) ||
        Number(order) < 0 ||
        Number(order) > 9999)
    ) {
      errors.sortOrder = 'Ingrese un entero entre 0 y 9999.';
    }
    return errors;
  },
  toPayload: (v, mode) => {
    const common = {
      name: collapse(v.name ?? ''),
      ageMin: optionalInt(v.ageMin ?? ''),
      ageMax: optionalInt(v.ageMax ?? ''),
      sortOrder: (v.sortOrder ?? '').trim() === '' ? 0 : Number(v.sortOrder),
    };
    return mode === 'create'
      ? { code: (v.code ?? '').trim(), ...common }
      : common;
  },
  statusActions: (c) =>
    c.status === 'activo'
      ? [
          {
            label: 'Desactivar',
            status: 'inactivo',
            description:
              'La categoría dejará de estar disponible, pero se conservan sus datos e historial.',
            reason: 'optional',
          },
        ]
      : [
          {
            label: 'Activar',
            status: 'activo',
            description: 'La categoría volverá a estar disponible.',
            reason: 'optional',
          },
        ],
  canDelete: () => true,
  deleteDescription: (c) =>
    `Se eliminará «${c.name}» de forma permanente. Si ya está en uso, el sistema no lo permitirá y deberá desactivarla. Esta acción no se puede deshacer.`,
};

// ───────────────────────────── temporadas ─────────────────────────────

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'borrador' | 'activa' | 'finalizada' | 'archivada';
  allowedTransitions: string[];
}

/** Etiqueta de la acción según el cambio de estado (las transiciones las decide el servidor). */
function transitionLabel(from: string, to: string): string {
  if (to === 'activa') return from === 'finalizada' ? 'Reabrir' : 'Activar';
  if (to === 'finalizada')
    return from === 'archivada' ? 'Restaurar' : 'Finalizar';
  if (to === 'archivada') return 'Archivar';
  return SEASON_STATUS_LABELS[to] ?? to;
}

function transitionDescription(from: string, to: string): string {
  return `La temporada pasará de «${SEASON_STATUS_LABELS[from]}» a «${SEASON_STATUS_LABELS[to]}». El cambio y su motivo quedan registrados en la auditoría.`;
}

export const seasonsConfig: CatalogConfig<Season> = {
  path: '/seasons',
  title: 'Temporadas',
  newLabel: 'Nueva temporada',
  editTitle: (s) => `Editar temporada: ${s.name}`,
  itemName: (s) => `Temporada «${s.name}»`,
  emptyText: 'Todavía no hay temporadas registradas.',
  searchLabel: 'Buscar por nombre',
  permissions: {
    read: 'seasons:read',
    manage: 'seasons:manage',
    delete: 'seasons:delete',
  },
  statusFilter: Object.entries(SEASON_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
  statusLabel: (s) => SEASON_STATUS_LABELS[s] ?? s,
  canEdit: (s) => s.status !== 'archivada',
  columns: [
    { header: 'Nombre', render: (s) => s.name },
    {
      header: 'Inicio',
      render: (s) => (
        <time dateTime={s.startDate}>{formatDate(s.startDate)}</time>
      ),
    },
    {
      header: 'Fin',
      render: (s) => <time dateTime={s.endDate}>{formatDate(s.endDate)}</time>,
    },
    {
      header: 'Estado',
      render: (s) => (
        <StatusBadge
          label={SEASON_STATUS_LABELS[s.status] ?? s.status}
          tone={
            s.status === 'activa'
              ? 'ok'
              : s.status === 'borrador'
                ? 'neutral'
                : 'off'
          }
        />
      ),
    },
  ],
  fields: [
    {
      name: 'name',
      label: 'Nombre',
      type: 'text',
      required: true,
      maxLength: 100,
      hint: 'Por ejemplo: Temporada 2026.',
    },
    {
      name: 'startDate',
      label: 'Fecha de inicio',
      type: 'date',
      required: true,
    },
    { name: 'endDate', label: 'Fecha de fin', type: 'date', required: true },
  ],
  initialValues: (s) => ({
    name: s?.name ?? '',
    startDate: s?.startDate ?? '',
    endDate: s?.endDate ?? '',
  }),
  validate: (v) => {
    const errors: Errors = {};
    validateName(v.name ?? '', errors);
    const start = (v.startDate ?? '').trim();
    const end = (v.endDate ?? '').trim();
    if (!start) errors.startDate = 'Ingrese la fecha de inicio.';
    else if (!isValidCalendarDate(start))
      errors.startDate = 'Ingrese una fecha válida.';
    if (!end) errors.endDate = 'Ingrese la fecha de fin.';
    else if (!isValidCalendarDate(end))
      errors.endDate = 'Ingrese una fecha válida.';
    if (!errors.startDate && !errors.endDate && end <= start) {
      errors.endDate = 'La fecha de fin debe ser posterior a la de inicio.';
    }
    return errors;
  },
  toPayload: (v) => ({
    name: collapse(v.name ?? ''),
    startDate: v.startDate,
    endDate: v.endDate,
  }),
  statusActions: (s) =>
    s.allowedTransitions.map((to) => ({
      label: transitionLabel(s.status, to),
      status: to,
      description: transitionDescription(s.status, to),
      reason: 'required' as const,
    })),
  canDelete: (s) => s.status === 'borrador',
  deleteDescription: (s) =>
    `Se eliminará la temporada «${s.name}» (en borrador) de forma permanente. Esta acción no se puede deshacer.`,
};
