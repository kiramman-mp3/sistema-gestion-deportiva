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
  return match ? { kind: match[1] as 'acta' | 'nomina', id: match[2]! } : null;
}

function currentHash(): string {
  return window.location.hash || '#/';
}

function Shell() {
  const { state } = useAuth();
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
      {credential ? (
        <main id="contenido" className="container">
          <CompleteCredentialForm
            kind={credential.kind}
            token={credential.token}
            onDone={() => setCredential(null)}
          />
        </main>
      ) : printRoute ? (
        <main id="contenido">
          <PrintDocumentView
            kind={printRoute.kind}
            id={printRoute.id}
            onBack={() => {
              window.location.hash = '#/portal';
            }}
          />
        </main>
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
          {state.status === 'loading' && (
            <main id="contenido" className="container">
              <output>Comprobando sesión…</output>
            </main>
          )}
          {state.status === 'anonymous' && (
            <main id="contenido" className="login-main">
              <LoginForm sessionExpired={state.expired} />
            </main>
          )}
          {state.status === 'authenticated' && (
            <CatalogsApp
              permissions={state.permissions}
              selfId={state.user.id}
            />
          )}
        </>
      )}
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
