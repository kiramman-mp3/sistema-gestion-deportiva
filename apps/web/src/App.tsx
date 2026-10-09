import { ApiStatus } from './features/health/ApiStatus.tsx';

export function App() {
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <h1>Liga Cantonal de Quero</h1>
        <p>Campeonatos, calendarios y resultados oficiales</p>
      </header>
      <main id="contenido" className="container">
        <ApiStatus />
      </main>
    </>
  );
}
