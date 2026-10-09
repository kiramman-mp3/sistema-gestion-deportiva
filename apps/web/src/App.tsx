import { useEffect, useState } from 'react';
import { CompleteCredentialForm } from './features/admin/PasswordForms.tsx';
import { AuthProvider, useAuth } from './features/auth/AuthContext.tsx';
import { LoginForm } from './features/auth/LoginForm.tsx';
import { CatalogsApp } from './features/catalogs/CatalogsApp.tsx';

type CredentialRoute = { kind: 'activar' | 'restablecer'; token: string };

/** Enlaces de contraseña: `#/activar/<token>` o `#/restablecer/<token>` (43 caracteres base64url). */
function readCredentialRoute(): CredentialRoute | null {
  const match = /^#\/(activar|restablecer)\/([A-Za-z0-9_-]{43})$/.exec(
    window.location.hash,
  );
  return match
    ? { kind: match[1] as CredentialRoute['kind'], token: match[2]! }
    : null;
}

function Shell() {
  const { state, logout } = useAuth();
  // El token se lee una vez y se borra de la dirección (historial, marcadores, capturas).
  const [credential, setCredential] = useState(readCredentialRoute);

  useEffect(() => {
    if (credential)
      window.history.replaceState(null, '', `${window.location.pathname}#/`);
  }, [credential]);

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <div>
          <h1>Liga Cantonal de Quero</h1>
          <p>Campeonatos, calendarios y resultados oficiales</p>
        </div>
        {state.status === 'authenticated' && !credential && (
          <div className="session-info">
            <span>{state.user.displayName}</span>
            <button type="button" onClick={() => void logout()}>
              Cerrar sesión
            </button>
          </div>
        )}
      </header>
      <main id="contenido" className="container">
        {credential ? (
          <CompleteCredentialForm
            kind={credential.kind}
            token={credential.token}
            onDone={() => setCredential(null)}
          />
        ) : (
          <>
            {state.status === 'loading' && <output>Comprobando sesión…</output>}
            {state.status === 'anonymous' && (
              <LoginForm sessionExpired={state.expired} />
            )}
            {state.status === 'authenticated' && (
              <CatalogsApp
                permissions={state.permissions}
                selfId={state.user.id}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
