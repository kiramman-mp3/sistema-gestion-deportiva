import { useEffect, useState } from 'react';
import { AuditPage } from '../admin/AuditPage.tsx';
import { ChangePasswordForm } from '../admin/PasswordForms.tsx';
import { RoleDetailPage } from '../admin/RoleDetailPage.tsx';
import { RolesPage } from '../admin/RolesPage.tsx';
import { UserDetailPage } from '../admin/UserDetailPage.tsx';
import { UsersPage } from '../admin/UsersPage.tsx';
import { AthleteDetailPage } from '../people/AthleteDetailPage.tsx';
import { AthletesPage } from '../people/AthletesPage.tsx';
import { ClubsPage } from '../people/ClubsPage.tsx';
import { TeamDetailPage } from '../people/TeamDetailPage.tsx';
import { TeamsPage } from '../people/TeamsPage.tsx';
import { ChampionshipDetailPage } from '../competitions/ChampionshipDetailPage.tsx';
import { ChampionshipsPage } from '../competitions/ChampionshipsPage.tsx';
import { VenuesPage } from '../competitions/VenuesPage.tsx';
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
  { hash: '#/usuarios', label: 'Usuarios', permission: 'users:read' },
  { hash: '#/roles', label: 'Roles y permisos', permission: 'roles:read' },
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
  { hash: '#/clubes', label: 'Clubes', permission: 'clubs:read' },
  { hash: '#/deportistas', label: 'Deportistas', permission: 'athletes:read' },
  { hash: '#/equipos', label: 'Equipos', permission: 'teams:read' },
  {
    hash: '#/campeonatos',
    label: 'Campeonatos',
    permission: 'championships:read',
  },
  {
    hash: '#/escenarios',
    label: 'Escenarios',
    permission: 'venues:read',
  },
  { hash: '#/auditoria', label: 'Auditoría', permission: 'audit:read' },
  { hash: '#/cuenta', label: 'Mi cuenta' },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function currentHash(): string {
  return window.location.hash || '#/';
}

const matches = (section: Section, hash: string) =>
  section.hash === '#/'
    ? hash === '#/'
    : hash === section.hash || hash.startsWith(`${section.hash}/`);

/** Navegación y secciones de administración, visibles según los permisos del usuario. */
export function CatalogsApp({
  permissions,
  selfId,
}: {
  permissions: readonly string[];
  selfId: string;
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
  // Una dirección sin permiso (o desconocida) vuelve a Inicio.
  const active = visible.find((s) => matches(s, hash)) ?? visible[0]!;
  const detailId = hash.split('/')[2];
  const hasAdminAccess = visible.some((s) => s.permission);

  return (
    <>
      <nav className="main-nav" aria-label="Secciones">
        <ul>
          {visible.map((s) => (
            <li key={s.hash}>
              <a href={s.hash} aria-current={s === active ? 'page' : undefined}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {active.hash === '#/' && (
        <section aria-labelledby="home-title">
          <h2 id="home-title">Inicio</h2>
          {hasAdminAccess ? (
            <p>Seleccione una sección para administrar la Liga.</p>
          ) : (
            <p>
              Su cuenta no tiene permisos de administración. Solicite acceso a
              un administrador de la Liga. Mientras tanto puede cambiar su
              contraseña en «Mi cuenta».
            </p>
          )}
          <ApiStatus />
        </section>
      )}
      {active.hash === '#/usuarios' &&
        (detailId && UUID.test(detailId) ? (
          <UserDetailPage
            key={detailId}
            userId={detailId}
            selfId={selfId}
            permissions={permissions}
          />
        ) : (
          <UsersPage permissions={permissions} />
        ))}
      {active.hash === '#/roles' &&
        (detailId && UUID.test(detailId) ? (
          <RoleDetailPage
            key={detailId}
            roleId={detailId}
            permissions={permissions}
          />
        ) : (
          <RolesPage permissions={permissions} />
        ))}
      {active.hash === '#/deportes' && (
        <CatalogAdmin config={sportsConfig} permissions={permissions} />
      )}
      {active.hash === '#/categorias' && (
        <CatalogAdmin config={categoriesConfig} permissions={permissions} />
      )}
      {active.hash === '#/temporadas' && (
        <CatalogAdmin config={seasonsConfig} permissions={permissions} />
      )}
      {active.hash === '#/clubes' && <ClubsPage permissions={permissions} />}
      {active.hash === '#/deportistas' &&
        (detailId && UUID.test(detailId) ? (
          <AthleteDetailPage
            key={detailId}
            athleteId={detailId}
            permissions={permissions}
          />
        ) : (
          <AthletesPage permissions={permissions} />
        ))}
      {active.hash === '#/equipos' &&
        (detailId && UUID.test(detailId) ? (
          <TeamDetailPage
            key={detailId}
            teamId={detailId}
            permissions={permissions}
          />
        ) : (
          <TeamsPage permissions={permissions} />
        ))}
      {active.hash === '#/campeonatos' &&
        (detailId && UUID.test(detailId) ? (
          <ChampionshipDetailPage
            key={detailId}
            championshipId={detailId}
            permissions={permissions}
          />
        ) : (
          <ChampionshipsPage permissions={permissions} />
        ))}
      {active.hash === '#/escenarios' && (
        <VenuesPage permissions={permissions} />
      )}
      {active.hash === '#/auditoria' && <AuditPage />}
      {active.hash === '#/cuenta' && <ChangePasswordForm />}
    </>
  );
}
