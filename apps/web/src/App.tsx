import { AuthProvider, useAuth } from './features/auth/AuthContext.tsx';
import { LoginForm } from './features/auth/LoginForm.tsx';
import { CatalogsApp } from './features/catalogs/CatalogsApp.tsx';

function Shell() {
  const { state, logout } = useAuth();

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
        {state.status === 'authenticated' && (
          <div className="session-info">
            <span>{state.user.displayName}</span>
            <button type="button" onClick={() => void logout()}>
              Cerrar sesión
            </button>
          </div>
        )}
      </header>
      <main id="contenido" className="container">
        {state.status === 'loading' && <output>Comprobando sesión…</output>}
        {state.status === 'anonymous' && (
          <LoginForm sessionExpired={state.expired} />
        )}
        {state.status === 'authenticated' && (
          <CatalogsApp permissions={state.permissions} />
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
