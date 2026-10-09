import { useEffect, useState } from 'react';
import { ApiStatus } from '../health/ApiStatus.tsx';
import { CatalogAdmin } from './CatalogAdmin.tsx';
import { categoriesConfig, seasonsConfig, sportsConfig } from './configs.tsx';

interface Section {
  hash: string;
  label: string;
  /** Permiso de lectura que habilita la sección (la API lo vuelve a comprobar). */
  permission?: string;
}

const SECTIONS: Section[] = [
  { hash: '#/', label: 'Inicio' },
  {
    hash: '#/deportes',
    label: 'Deportes',
    permission: sportsConfig.permissions.read,
  },
  {
    hash: '#/categorias',
    label: 'Categorías',
    permission: categoriesConfig.permissions.read,
  },
  {
    hash: '#/temporadas',
    label: 'Temporadas',
    permission: seasonsConfig.permissions.read,
  },
];

function currentHash(): string {
  return window.location.hash || '#/';
}

/** Navegación y secciones de administración, visibles según los permisos del usuario. */
export function CatalogsApp({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const [hash, setHash] = useState(currentHash);

  useEffect(() => {
    const onChange = () => setHash(currentHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const visible = SECTIONS.filter(
    (s) => !s.permission || permissions.includes(s.permission),
  );
  const active = visible.find((s) => s.hash === hash) ?? visible[0]!;

  return (
    <>
      <nav className="main-nav" aria-label="Secciones">
        <ul>
          {visible.map((s) => (
            <li key={s.hash}>
              <a
                href={s.hash}
                aria-current={s.hash === active.hash ? 'page' : undefined}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {active.hash === '#/' && (
        <section aria-labelledby="home-title">
          <h2 id="home-title">Inicio</h2>
          {visible.length === 1 ? (
            <p>
              Su cuenta no tiene permisos de administración de catálogos.
              Solicite acceso a un administrador de la Liga.
            </p>
          ) : (
            <p>
              Seleccione una sección para administrar los catálogos de la Liga.
            </p>
          )}
          <ApiStatus />
        </section>
      )}
      {active.hash === '#/deportes' && (
        <CatalogAdmin config={sportsConfig} permissions={permissions} />
      )}
      {active.hash === '#/categorias' && (
        <CatalogAdmin config={categoriesConfig} permissions={permissions} />
      )}
      {active.hash === '#/temporadas' && (
        <CatalogAdmin config={seasonsConfig} permissions={permissions} />
      )}
    </>
  );
}
