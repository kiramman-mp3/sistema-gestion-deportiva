import type { ReactNode } from 'react';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CatalogItem {
  id: string;
  status: string;
}

export type Values = Record<string, string>;
export type Errors = Record<string, string>;
export type Mode = 'create' | 'edit';

export interface FieldSpec {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date';
  hint?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Solo editable al crear; en edición se muestra de solo lectura. */
  createOnly?: boolean;
  required?: boolean;
}

export interface StatusAction {
  label: string;
  status: string;
  /** Texto del diálogo de confirmación. */
  description: string;
  reason: 'optional' | 'required';
}

export interface CatalogConfig<T extends CatalogItem> {
  /** Ruta de la API, p. ej. `/sports`. */
  path: string;
  title: string;
  /** Texto del botón de creación y títulos de formulario. */
  newLabel: string;
  editTitle: (item: T) => string;
  itemName: (item: T) => string;
  emptyText: string;
  searchLabel: string;
  permissions: { read: string; manage: string; delete: string };
  statusFilter: { value: string; label: string }[];
  statusLabel: (status: string) => string;
  columns: { header: string; render: (item: T) => ReactNode }[];
  fields: FieldSpec[];
  initialValues: (item?: T) => Values;
  validate: (values: Values, mode: Mode) => Errors;
  toPayload: (values: Values, mode: Mode) => Record<string, unknown>;
  statusActions: (item: T) => StatusAction[];
  canDelete: (item: T) => boolean;
  deleteDescription: (item: T) => string;
  /** Mensaje cuando una operación de edición no está permitida para el elemento. */
  canEdit?: (item: T) => boolean;
}
