import { type FormEvent, useId, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { describeError } from '../../components/Notice.tsx';

const MIN = 12;
const MAX = 128;

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  autoComplete: 'current-password' | 'new-password';
  disabled: boolean;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  disabled,
}: PasswordFieldProps) {
  const describedBy =
    [hint ? `${id}-h` : '', error ? `${id}-e` : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
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

const POLICY_HINT = `Entre ${MIN} y ${MAX} caracteres. Puede usar frases largas con espacios.`;

function validateNew(
  password: string,
  confirm: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (password.length < MIN)
    errors.newPassword = `La contraseña debe tener al menos ${MIN} caracteres.`;
  else if (password.length > MAX)
    errors.newPassword = `La contraseña no puede superar ${MAX} caracteres.`;
  if (confirm !== password) errors.confirm = 'Las contraseñas no coinciden.';
  return errors;
}

/** Cambio de la propia contraseña. Revoca las demás sesiones de la cuenta. */
export function ChangePasswordForm() {
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validateNew(next, confirm);
    if (!current) found.currentPassword = 'Ingrese su contraseña actual.';
    setErrors(found);
    setFormError(null);
    setDone(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const res = await apiRequest<{ revokedSessions: number }>(
        '/auth/password/change',
        {
          method: 'POST',
          body: { currentPassword: current, newPassword: next },
        },
      );
      setDone(res.revokedSessions);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors)
        setErrors(error.fieldErrors);
      setFormError(
        error instanceof ApiError && error.status === 429
          ? 'Demasiados intentos. Espere unos minutos antes de volver a intentarlo.'
          : describeError(error),
      );
    } finally {
      // Ninguna contraseña se conserva en pantalla tras enviar.
      setCurrent('');
      setNext('');
      setConfirm('');
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="account-title" className="catalog">
      <h1 id="account-title">Mi cuenta</h1>
      <form
        className="catalog-form"
        onSubmit={submit}
        noValidate
        aria-labelledby={`${id}-t`}
      >
        <h2 id={`${id}-t`}>Cambiar contraseña</h2>
        <PasswordField
          id={`${id}-c`}
          label="Contraseña actual"
          value={current}
          onChange={setCurrent}
          error={errors.currentPassword}
          autoComplete="current-password"
          disabled={submitting}
        />
        <PasswordField
          id={`${id}-n`}
          label="Nueva contraseña"
          value={next}
          onChange={setNext}
          error={errors.newPassword}
          hint={POLICY_HINT}
          autoComplete="new-password"
          disabled={submitting}
        />
        <PasswordField
          id={`${id}-r`}
          label="Repita la nueva contraseña"
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
          autoComplete="new-password"
          disabled={submitting}
        />
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        {done !== null && (
          <output className="notice success">
            Contraseña actualizada.{' '}
            {done > 0
              ? `Se cerraron ${done} ${done === 1 ? 'sesión' : 'sesiones'} en otros dispositivos.`
              : 'No había otras sesiones abiertas.'}
          </output>
        )}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * Canje de un enlace de activación o restablecimiento entregado por un administrador.
 * El token se recibe en el fragmento de la URL, se usa una vez y no se conserva.
 */
export function CompleteCredentialForm({
  kind,
  token,
  onDone,
}: {
  kind: 'activar' | 'restablecer';
  token: string;
  onDone: () => void;
}) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const activation = kind === 'activar';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validateNew(password, confirm);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await apiRequest('/auth/password/complete', {
        method: 'POST',
        body: { token, password },
        skipUnauthorizedHandler: true,
      });
      setFinished(true);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors?.password) {
        setErrors({ newPassword: error.fieldErrors.password });
      } else {
        setFormError(
          error instanceof ApiError && error.status === 429
            ? 'Demasiados intentos. Espere unos minutos antes de volver a intentarlo.'
            : describeError(error),
        );
      }
    } finally {
      setPassword('');
      setConfirm('');
      setSubmitting(false);
    }
  }

  if (finished) {
    return (
      <section aria-labelledby={`${id}-done`} className="login-form">
        <h1 id={`${id}-done`}>
          {activation ? 'Cuenta activada' : 'Contraseña restablecida'}
        </h1>
        <p>
          {activation
            ? 'Su contraseña quedó establecida. Ya puede iniciar sesión.'
            : 'Su contraseña fue cambiada y se cerraron todas sus sesiones. Ya puede iniciar sesión.'}
        </p>
        <button type="button" className="primary" onClick={onDone}>
          Ir a iniciar sesión
        </button>
      </section>
    );
  }

  return (
    <form
      className="login-form"
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-t`}
    >
      <h1 id={`${id}-t`}>
        {activation ? 'Activar su cuenta' : 'Restablecer su contraseña'}
      </h1>
      <p className="hint">
        {activation
          ? 'Elija la contraseña con la que ingresará al sistema.'
          : 'Elija su nueva contraseña.'}{' '}
        Este enlace solo puede usarse una vez.
      </p>
      <PasswordField
        id={`${id}-n`}
        label="Nueva contraseña"
        value={password}
        onChange={setPassword}
        error={errors.newPassword}
        hint={POLICY_HINT}
        autoComplete="new-password"
        disabled={submitting}
      />
      <PasswordField
        id={`${id}-r`}
        label="Repita la contraseña"
        value={confirm}
        onChange={setConfirm}
        error={errors.confirm}
        autoComplete="new-password"
        disabled={submitting}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="primary" disabled={submitting}>
        {submitting
          ? 'Guardando…'
          : activation
            ? 'Activar cuenta'
            : 'Guardar contraseña'}
      </button>
    </form>
  );
}
