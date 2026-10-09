import { useId } from 'react';

interface FieldProps {
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
}

/** Campo de texto accesible con etiqueta, ayuda y error asociados. */
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
}: FieldProps) {
  const id = useId();
  const describedBy =
    [error ? `${id}-e` : '', hint ? `${id}-h` : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="field">
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
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  required,
  disabled,
}: SelectProps) {
  const id = useId();
  return (
    <div className="field">
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
          {error}
        </p>
      )}
    </div>
  );
}

/** Estados de carga y error comunes a los listados. */
export function LoadState({
  state,
  onRetry,
}: {
  state: { kind: 'loading' | 'error' | 'ready'; message?: string };
  onRetry: () => void;
}) {
  if (state.kind === 'loading')
    return <output className="loading">Cargando…</output>;
  if (state.kind === 'error')
    return (
      <div className="state-error" role="alert">
        <p>{state.message}</p>
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  return null;
}
