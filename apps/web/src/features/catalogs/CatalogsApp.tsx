import { useEffect, useState } from 'react';
import {
  AppShell,
  filterNavGroups,
  isSectionActive,
  PANEL_NAV_GROUPS,
} from '../../components/AppShell.tsx';
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
import { AnnouncementsPage } from '../content/AnnouncementsPage.tsx';
import { CaseDetailPage } from '../discipline/CaseDetailPage.tsx';
import { DocumentsPage } from '../documents/DocumentsPage.tsx';
import { DisciplinePage } from '../discipline/DisciplinePage.tsx';
import { InstitutionPage } from '../institution/InstitutionPage.tsx';
import { AdminHome } from '../home/AdminHome.tsx';
import { NotificationsPage } from '../notifications/NotificationsPage.tsx';
import { MyAssignmentsPage } from '../officials/MyAssignmentsPage.tsx';
import { OfficialDetailPage } from '../officials/OfficialDetailPage.tsx';
import { OfficialsPage } from '../officials/OfficialsPage.tsx';
import { useUnreadCount } from '../notifications/useUnreadCount.ts';
import { CatalogAdmin } from './CatalogAdmin.tsx';
import { categoriesConfig, seasonsConfig, sportsConfig } from './configs.tsx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function currentHash(): string {
  return window.location.hash || '#/';
}

/** Navegación y secciones de administración, visibles según los permisos del usuario. */
export function CatalogsApp({
  permissions,
  selfId,
  userName,
  onLogout,
}: {
  permissions: readonly string[];
  selfId: string;
  userName: string;
  onLogout: () => void | Promise<void>;
}) {
  const [hash, setHash] = useState(currentHash);
  const unread = useUnreadCount();

  useEffect(() => {
    const onChange = () => setHash(currentHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // Las secciones salen del mismo menú que se muestra (una sola definición).
  const visible = filterNavGroups(PANEL_NAV_GROUPS, permissions).flatMap(
    (group) => group.items,
  );
  // Una dirección sin permiso (o desconocida) vuelve a Inicio.
  const active =
    visible.find((s) => isSectionActive(s.hash, hash)) ?? visible[0]!;
  const detailId = hash.split('/')[2];

  return (
    <AppShell
      user={{ displayName: userName }}
      permissions={permissions}
      unreadCount={unread}
      logout={onLogout}
      activeHash={hash}
    >
      {active.hash === '#/' && (
        <AdminHome permissions={permissions} unreadCount={unread} />
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
      {active.hash === '#/arbitros' &&
        (detailId && UUID.test(detailId) ? (
          <OfficialDetailPage
            key={detailId}
            officialId={detailId}
            permissions={permissions}
          />
        ) : (
          <OfficialsPage permissions={permissions} />
        ))}
      {active.hash === '#/mis-designaciones' && (
        <MyAssignmentsPage permissions={permissions} />
      )}
      {active.hash === '#/disciplina' &&
        (detailId && UUID.test(detailId) ? (
          <CaseDetailPage
            key={detailId}
            caseId={detailId}
            permissions={permissions}
          />
        ) : (
          <DisciplinePage permissions={permissions} />
        ))}
      {active.hash === '#/documentos' && (
        <DocumentsPage permissions={permissions} />
      )}
      {active.hash === '#/noticias' && (
        <AnnouncementsPage permissions={permissions} />
      )}
      {active.hash === '#/escenarios' && (
        <VenuesPage permissions={permissions} />
      )}
      {active.hash === '#/institucion' && (
        <InstitutionPage permissions={permissions} />
      )}
      {active.hash === '#/auditoria' && <AuditPage />}
      {active.hash === '#/notificaciones' && (
        <NotificationsPage permissions={permissions} />
      )}
      {active.hash === '#/cuenta' && <ChangePasswordForm />}
    </AppShell>
  );
}
