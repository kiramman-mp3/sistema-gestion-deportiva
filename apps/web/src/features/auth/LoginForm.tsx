import { type FormEvent, useId, useState } from 'react';
import { ApiError } from '../../api/client.ts';
import { useAuth } from './AuthContext.tsx';

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = 'Ingrese su correo electrónico.';
  else if (!/^\S+@\S+\.\S+$/.test(email.trim()))
    errors.email = 'Ingrese un correo electrónico válido.';
  if (!password) errors.password = 'Ingrese su contraseña.';
  return errors;
}

/** Mensajes deliberadamente genéricos: no revelan si la cuenta existe. */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Correo o contraseña incorrectos.';
    if (error.status === 429) {
      const minutes = error.retryAfter
        ? Math.max(1, Math.ceil(error.retryAfter / 60))
        : null;
      return minutes
        ? `Demasiados intentos. Espere ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} antes de volver a intentarlo.`
        : 'Demasiados intentos. Espere unos minutos antes de volver a intentarlo.';
    }
    if (error.status === undefined)
      return 'No se pudo conectar con el servidor. Revise su conexión.';
  }
  return 'No se pudo iniciar sesión. Intente de nuevo más tarde.';
}

export function LoginForm({ sessionExpired }: { sessionExpired: boolean }) {
  const { login } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const errors = validate(email, password);
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (error) {
      setFormError(messageFor(error));
      // La contraseña no se conserva tras un intento fallido.
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="login-form"
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="login-title"
    >
      <h2 id="login-title">Iniciar sesión</h2>

      {sessionExpired && (
        <output className="notice">
          Su sesión expiró o fue cerrada. Inicie sesión de nuevo.
        </output>
      )}

      <div className="field">
        <label htmlFor={emailId}>Correo electrónico</label>
        <input
          id={emailId}
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          disabled={submitting}
        />
        {fieldErrors.email && (
          <p className="field-error" id={`${emailId}-error`}>
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={passwordId}>Contraseña</label>
        <input
          id={passwordId}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={
            fieldErrors.password ? `${passwordId}-error` : undefined
          }
          disabled={submitting}
        />
        {fieldErrors.password && (
          <p className="field-error" id={`${passwordId}-error`}>
            {fieldErrors.password}
          </p>
        )}
      </div>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  );
}
