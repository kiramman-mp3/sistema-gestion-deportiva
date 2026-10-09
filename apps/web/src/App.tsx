import { useEffect, useState } from 'react';
import { CompleteCredentialForm } from './features/admin/PasswordForms.tsx';
import { AuthProvider, useAuth } from './features/auth/AuthContext.tsx';
import { LoginForm } from './features/auth/LoginForm.tsx';
import { CatalogsApp } from './features/catalogs/CatalogsApp.tsx';
import { PrintDocumentView } from './features/public/PrintDocumentView.tsx';
import { PublicPortalPage } from './features/public/PublicPortalPage.tsx';

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

function readPrintRoute(): { kind: 'acta' | 'nomina'; id: string } | null {
  const match = /^#\/imprimir\/(acta|nomina)\/([0-9a-fA-F-]+)$/.exec(
    window.location.hash,
  );
  return match
    ? { kind: match[1] as 'acta' | 'nomina', id: match[2]! }
    : null;
}

function currentHash(): string {
  return window.location.hash || '#/';
}

function Shell() {
  const { state, logout } = useAuth();
  // El token se lee una vez y se borra de la dirección (historial, marcadores, capturas).
  const [credential, setCredential] = useState(readCredentialRoute);
  const [hash, setHash] = useState(currentHash);

  useEffect(() => {
    const onHashChange = () => {
      setHash(currentHash());
      const cred = readCredentialRoute();
      if (cred) setCredential(cred);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (credential)
      window.history.replaceState(null, '', `${window.location.pathname}#/`);
  }, [credential]);

  const printRoute = readPrintRoute();
  const isPortalRoute = hash === '#/portal' || hash.startsWith('#/portal/');

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <nav aria-label="Portal y acceso">
            {isPortalRoute ? (
              <a href="#/" className="link-button">
                {state.status === 'authenticated'
                  ? 'Panel de Administración'
                  : 'Iniciar sesión'}
              </a>
            ) : (
              <a href="#/portal" className="link-button">
                Portal Público
              </a>
            )}
          </nav>
          {state.status === 'authenticated' && !credential && (
            <div className="session-info">
              <span>{state.user.displayName}</span>
              <button type="button" onClick={() => void logout()}>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>
      <main id="contenido" className="container">
        {credential ? (
          <CompleteCredentialForm
            kind={credential.kind}
            token={credential.token}
            onDone={() => setCredential(null)}
          />
        ) : printRoute ? (
          <PrintDocumentView
            kind={printRoute.kind}
            id={printRoute.id}
            onBack={() => {
              window.location.hash = '#/portal';
            }}
          />
        ) : isPortalRoute ? (
          <PublicPortalPage
            onLoginClick={() => {
              window.location.hash = '#/';
            }}
            onOpenPrintDocument={(kind, id) => {
              window.location.hash = `#/imprimir/${kind}/${id}`;
            }}
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
