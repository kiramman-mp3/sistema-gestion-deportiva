import { useId } from 'react';
import { Icon } from './Icon.tsx';

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
  disabled?: boolean;
  hint?: string;
  autoComplete?: string;
  className?: string;
}

/** Campo de texto accesible con etiqueta, ayuda y error asociados (spec §8). */
export function TextField({
  label,
  value,
  onChange,
  error,
  required,
  type = 'text',
  maxLength,
  disabled,
  hint,
  autoComplete = 'off',
  className = '',
}: FieldProps) {
  const id = useId();
  const describedBy =
    [error ? `${id}-e` : '', hint ? `${id}-h` : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className={`field ${className}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint && (
        <p className="hint" id={`${id}-h`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-e`}>
          <Icon name="alert-triangle" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Menú desplegable accesible con etiqueta, ayuda y error asociados (spec §8). */
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  required,
  disabled,
  className = '',
}: SelectProps) {
  const id = useId();
  return (
    <div className={`field ${className}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : undefined}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="field-error" id={`${id}-e`}>
          <Icon name="alert-triangle" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export interface TextAreaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
  hint?: string;
  rows?: number;
  className?: string;
}

/** Área de texto accesible con etiqueta, ayuda y error asociados (spec §8). */
export function TextAreaField({
  label,
  value,
  onChange,
  error,
  required,
  maxLength,
  disabled,
  hint,
  rows = 4,
  className = '',
}: TextAreaProps) {
  const id = useId();
  const describedBy =
    [error ? `${id}-e` : '', hint ? `${id}-h` : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className={`field ${className}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint && (
        <p className="hint" id={`${id}-h`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-e`}>
          <Icon name="alert-triangle" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

/** Casilla de verificación con etiqueta y ayuda asociadas (spec §8). */
export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  hint,
  className = '',
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`field check-field ${className}`.trim()}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? `${id}-h` : undefined}
      />
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="hint" id={`${id}-h`}>
          {hint}
        </p>
      )}
    </div>
  );
}
