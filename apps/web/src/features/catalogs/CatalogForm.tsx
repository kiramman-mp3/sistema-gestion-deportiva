import { type FormEvent, useId, useState } from 'react';
import { ApiError } from '../../api/client.ts';
import type {
  CatalogConfig,
  CatalogItem,
  Errors,
  Mode,
  Values,
} from './types.ts';

interface CatalogFormProps<T extends CatalogItem> {
  config: CatalogConfig<T>;
  mode: Mode;
  item?: T;
  title: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

/** Formulario de creación/edición generado a partir de la configuración del catálogo. */
export function CatalogForm<T extends CatalogItem>({
  config,
  mode,
  item,
  title,
  onSubmit,
  onCancel,
}: CatalogFormProps<T>) {
  const formId = useId();
  const [values, setValues] = useState<Values>(() =>
    config.initialValues(item),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = config.validate(values, mode);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(config.toPayload(values, mode));
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        setErrors(error.fieldErrors);
        setFormError('Revise los campos marcados.');
      } else {
        setFormError(
          error instanceof Error ? error.message : 'No se pudo guardar.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  const firstEditable = config.fields.find(
    (f) => mode === 'create' || !f.createOnly,
  );

  return (
    <form
      className="catalog-form"
      onSubmit={submit}
      noValidate
      aria-labelledby={`${formId}-title`}
    >
      <h3 id={`${formId}-title`}>{title}</h3>

      {config.fields.map((field) => {
        const id = `${formId}-${field.name}`;
        const readOnly = mode === 'edit' && field.createOnly;
        const describedBy =
          [
            field.hint ? `${id}-hint` : '',
            errors[field.name] ? `${id}-error` : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined;
        return (
          <div className="field" key={field.name}>
            <label htmlFor={id}>
              {field.label}
              {field.required ? <span aria-hidden="true"> *</span> : null}
            </label>
            <input
              id={id}
              name={field.name}
              type={field.type}
              value={values[field.name] ?? ''}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field.name]: e.target.value }))
              }
              maxLength={field.maxLength}
              min={field.min}
              max={field.max}
              inputMode={field.type === 'number' ? 'numeric' : undefined}
              readOnly={readOnly}
              aria-required={field.required ? true : undefined}
              aria-invalid={errors[field.name] ? true : undefined}
              aria-describedby={describedBy}
              autoComplete="off"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- el formulario se abre por acción explícita del usuario
              autoFocus={field === firstEditable}
              disabled={submitting}
            />
            {field.hint && (
              <p className="hint" id={`${id}-hint`}>
                {readOnly && field.createOnly
                  ? 'No se puede modificar una vez creado.'
                  : field.hint}
              </p>
            )}
            {errors[field.name] && (
              <p className="field-error" id={`${id}-error`}>
                {errors[field.name]}
              </p>
            )}
          </div>
        );
      })}

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
