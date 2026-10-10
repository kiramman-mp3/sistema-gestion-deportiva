import { type FormEvent, useEffect, useId, useState } from 'react';
import { ApiError, apiGet } from '../../api/client.ts';
import { Icon } from '../../components/Icon.tsx';
import { InstitutionBrand } from '../../components/InstitutionBrand.tsx';
import type { PublicHome } from '../public/types.ts';
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
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Carga del último resultado oficial real vía `/public/home` para el panel lateral
  const [homeData, setHomeData] = useState<PublicHome | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<PublicHome>('/public/home')
      .then((data) => {
        if (active) setHomeData(data);
      })
      .catch(() => {
        // En caso de fallo o si la API no está disponible, no mostramos marcador inventado
        if (active) setHomeData(null);
      });
    return () => {
      active = false;
    };
  }, []);

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

  const recentMatch =
    homeData && homeData.recent && homeData.recent.length > 0
      ? homeData.recent[0]
      : null;

  const localParticipant =
    recentMatch?.participants.find((p) => p.side === 'local') ??
    recentMatch?.participants[0];
  const awayParticipant =
    recentMatch?.participants.find((p) => p.side === 'visitante') ??
    recentMatch?.participants[1];

  return (
    <div className="login-page-container">
      {/* Panel lateral en escritorio (≥ 64rem): marca + último resultado oficial o solo identidad */}
      <aside className="login-brand-panel">
        <div className="login-brand-header">
          <InstitutionBrand showSubtitle />
        </div>

        {recentMatch && localParticipant && awayParticipant ? (
          <div
            className="login-scoreboard"
            aria-label="Último resultado oficial"
          >
            <span className="scoreboard-badge">Último resultado oficial</span>
            <div className="scoreboard-championship">
              {recentMatch.championship.name}
            </div>
            <div className="scoreboard-matchup">
              <div className="scoreboard-team">
                <span className="team-name">{localParticipant.name}</span>
                <span className="team-score">
                  {localParticipant.score !== null
                    ? localParticipant.score
                    : '-'}
                </span>
              </div>
              <div className="scoreboard-vs">vs</div>
              <div className="scoreboard-team">
                <span className="team-name">{awayParticipant.name}</span>
                <span className="team-score">
                  {awayParticipant.score !== null ? awayParticipant.score : '-'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="login-identity-message">
            <p className="login-motto">
              Gestión deportiva cantonal, resultados transparentes y actas
              oficiales.
            </p>
          </div>
        )}
      </aside>

      {/* Formulario de inicio de sesión */}
      <div className="login-form-wrapper">
        <form
          className="login-form"
          onSubmit={onSubmit}
          noValidate
          aria-labelledby="login-title"
        >
          {/* Marca visible en pantallas estrechas (< 64rem) encima del formulario */}
          <div className="login-mobile-brand">
            <InstitutionBrand showSubtitle />
          </div>

          <h1 id="login-title">Iniciar sesión</h1>

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
              aria-describedby={
                fieldErrors.email ? `${emailId}-error` : undefined
              }
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
            <div className="password-input-container">
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
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
              <button
                type="button"
                className="password-toggle-button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-pressed={showPassword}
                aria-label="Mostrar contraseña"
                title={
                  showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
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

          <button
            type="submit"
            disabled={submitting}
            className="primary login-submit-button"
          >
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
