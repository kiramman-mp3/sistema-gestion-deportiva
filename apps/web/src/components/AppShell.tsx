import { type ReactNode, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import { InstitutionBrand } from './InstitutionBrand.tsx';
import { NavDrawer } from './NavDrawer.tsx';

export interface NavItem {
  hash: string;
  label: string;
  permission?: string;
  icon: IconName;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export const DISCIPLINE_PERMISSIONS = [
  'incidents:read',
  'complaints:read',
  'cases:read',
  'sanctions:read',
];

export const PANEL_NAV_GROUPS: NavGroup[] = [
  {
    items: [{ hash: '#/', label: 'Inicio', icon: 'home' }],
  },
  {
    title: 'Competencias',
    items: [
      {
        hash: '#/campeonatos',
        label: 'Campeonatos',
        permission: 'championships:read',
        icon: 'trophy',
      },
      {
        hash: '#/escenarios',
        label: 'Escenarios',
        permission: 'venues:read',
        icon: 'map-pin',
      },
      {
        hash: '#/deportes',
        label: 'Deportes',
        permission: 'sports:read',
        icon: 'shield',
      },
      {
        hash: '#/categorias',
        label: 'Categorías',
        permission: 'categories:read',
        icon: 'tag',
      },
      {
        hash: '#/temporadas',
        label: 'Temporadas',
        permission: 'seasons:read',
        icon: 'calendar',
      },
    ],
  },
  {
    title: 'Clubes y deportistas',
    items: [
      {
        hash: '#/clubes',
        label: 'Clubes',
        permission: 'clubs:read',
        icon: 'shield',
      },
      {
        hash: '#/deportistas',
        label: 'Deportistas',
        permission: 'athletes:read',
        icon: 'users',
      },
      {
        hash: '#/equipos',
        label: 'Equipos',
        permission: 'teams:read',
        icon: 'users',
      },
    ],
  },
  {
    title: 'Arbitraje',
    items: [
      {
        hash: '#/arbitros',
        label: 'Árbitros y jueces',
        permission: 'officials:read',
        icon: 'flag',
      },
      {
        hash: '#/mis-designaciones',
        label: 'Mis designaciones',
        permission: 'assignments:read_own',
        icon: 'file-text',
      },
    ],
  },
  {
    title: 'Disciplina',
    items: [
      {
        hash: '#/disciplina',
        label: 'Disciplina',
        permission: 'discipline',
        icon: 'alert-triangle',
      },
    ],
  },
  {
    title: 'Comunicación',
    items: [
      {
        hash: '#/noticias',
        label: 'Noticias',
        permission: 'announcements:read',
        icon: 'newspaper',
      },
      {
        hash: '#/documentos',
        label: 'Documentos',
        permission: 'reports:read',
        icon: 'file-text',
      },
    ],
  },
  {
    title: 'Administración',
    items: [
      {
        hash: '#/institucion',
        label: 'Institución',
        permission: 'institution:read',
        icon: 'building',
      },
      {
        hash: '#/usuarios',
        label: 'Usuarios',
        permission: 'users:read',
        icon: 'users',
      },
      {
        hash: '#/roles',
        label: 'Roles y permisos',
        permission: 'roles:read',
        icon: 'shield',
      },
      {
        hash: '#/auditoria',
        label: 'Auditoría',
        permission: 'audit:read',
        icon: 'eye',
      },
    ],
  },
  {
    title: 'Cuenta',
    items: [
      {
        hash: '#/notificaciones',
        label: 'Notificaciones',
        icon: 'bell',
      },
      {
        hash: '#/cuenta',
        label: 'Mi cuenta',
        icon: 'user',
      },
    ],
  },
];

export function filterNavGroups(
  groups: NavGroup[],
  permissions: readonly string[],
): NavGroup[] {
  return groups
    .map((group) => {
      const visibleItems = group.items.filter((item) => {
        if (!item.permission) return true;
        if (item.permission === 'discipline') {
          return DISCIPLINE_PERMISSIONS.some((p) => permissions.includes(p));
        }
        return permissions.includes(item.permission);
      });
      return {
        ...group,
        items: visibleItems,
      };
    })
    .filter((group) => group.items.length > 0);
}

export function isSectionActive(
  sectionHash: string,
  currentHash: string,
): boolean {
  if (sectionHash === '#/') return currentHash === '#/';
  return (
    currentHash === sectionHash || currentHash.startsWith(`${sectionHash}/`)
  );
}

export interface AppShellProps {
  user: { displayName: string };
  permissions: readonly string[];
  unreadCount?: number;
  logout: () => void | Promise<void>;
  activeHash: string;
  children: ReactNode;
}

export function AppShell({
  user,
  permissions,
  unreadCount = 0,
  logout,
  activeHash,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const visibleGroups = filterNavGroups(PANEL_NAV_GROUPS, permissions);

  const renderNavList = (onItemClick?: () => void) => (
    <div className="nav-groups-container">
      {visibleGroups.map((group, groupIdx) => (
        <div key={group.title ?? `group-${groupIdx}`} className="nav-group">
          {group.title ? (
            <span className="nav-group-title">{group.title}</span>
          ) : null}
          <ul className="nav-list">
            {group.items.map((item) => {
              const active = isSectionActive(item.hash, activeHash);
              return (
                <li key={item.hash} className="nav-item">
                  <a
                    href={item.hash}
                    aria-current={active ? 'page' : undefined}
                    className={`nav-link ${active ? 'active' : ''}`.trim()}
                    onClick={onItemClick}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                    {item.hash === '#/notificaciones' && unreadCount > 0 && (
                      <span className="nav-badge">
                        <span aria-hidden="true"> ({unreadCount})</span>
                        <span className="visually-hidden">
                          , {unreadCount} sin leer
                        </span>
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="panel-shell">
      {/* Barra lateral fija en pantallas ≥ 64rem */}
      <aside className="panel-sidebar">
        <div className="sidebar-brand-container">
          <InstitutionBrand href="#/" short showSubtitle />
        </div>
        <div className="sidebar-scrollable-content">
          <nav aria-label="Secciones" className="panel-navigation">
            {renderNavList()}
          </nav>
        </div>
      </aside>

      {/* Área principal */}
      <div className="panel-main">
        {/* Barra superior en escritorio y móvil */}
        <header className="panel-topbar">
          <div className="topbar-left">
            <button
              ref={menuButtonRef}
              type="button"
              className="topbar-menu-button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menú"
            >
              <Icon name="menu" size={22} />
              <span className="topbar-menu-text">Menú</span>
            </button>
            <div className="topbar-mobile-brand">
              <InstitutionBrand href="#/" short />
            </div>
          </div>

          <div className="topbar-right">
            <a
              href="#/portal"
              className="topbar-link portal-link"
              title="Ir al Portal Público"
            >
              <Icon name="globe" size={18} />
              <span className="topbar-link-text">Portal Público</span>
            </a>

            <div className="topbar-user-section">
              <span className="topbar-username" title={user.displayName}>
                {user.displayName}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="topbar-logout-button"
              >
                <Icon name="log-out" size={16} />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </header>

        {/* Contenido principal */}
        <main className="panel-content" id="contenido">
          <div className="panel-container">{children}</div>
        </main>
      </div>

      {/* Menú drawer para pantallas móviles < 64rem */}
      <NavDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        triggerRef={menuButtonRef}
        title="Secciones de la Liga"
      >
        <div className="drawer-nav-container">
          <nav aria-label="Navegación móvil" className="drawer-navigation">
            {renderNavList(() => setDrawerOpen(false))}
          </nav>
        </div>
      </NavDrawer>
    </div>
  );
}
