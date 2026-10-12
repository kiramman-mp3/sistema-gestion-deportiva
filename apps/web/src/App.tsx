import { useEffect, useRef, useState } from 'react';
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

/** Pantalla de inicio de sesión; la raíz (`#/`) es la portada pública para quien no tiene sesión. */
const LOGIN_HASH = '#/ingresar';

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
    if (!credential) return;
    // Al terminar, el formulario lleva a iniciar sesión.
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${LOGIN_HASH}`,
    );
  }, [credential]);

  // Al salir se pasa a iniciar sesión antes de que la sesión termine.
  const leaving = useRef(false);

  // Con sesión, el inicio de sesión no tiene sentido: se vuelve al panel.
  useEffect(() => {
    if (
      state.status === 'authenticated' &&
      hash === LOGIN_HASH &&
      !leaving.current
    )
      window.location.replace('#/');
  }, [state.status, hash]);

  const printRoute = readPrintRoute();
  const isPortalRoute = hash === '#/portal' || hash.startsWith('#/portal/');
  // Sin sesión, la raíz muestra la portada; las direcciones del panel piden iniciar sesión.
  const showLanding =
    state.status === 'anonymous' && !state.expired && hash === '#/';

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
        <main id="contenido" className="container">
          <PrintDocumentView
            kind={printRoute.kind}
            id={printRoute.id}
            onBack={() => {
              window.location.hash = '#/portal';
            }}
          />
        </main>
      ) : isPortalRoute || showLanding ? (
        <PublicPortalPage
          onLoginClick={() => {
            window.location.hash = LOGIN_HASH;
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
              userName={state.user.displayName}
              onLogout={async () => {
                leaving.current = true;
                window.location.hash = LOGIN_HASH;
                try {
                  await logout();
                } finally {
                  leaving.current = false;
                }
              }}
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
