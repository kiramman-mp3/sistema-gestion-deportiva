import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/client.ts';
import { EmptyState } from '../../components/EmptyState.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { StatusBadge } from '../../components/StatusBadge.tsx';
import { ApiStatus } from '../health/ApiStatus.tsx';
import type { Page } from '../admin/types.ts';
import type { Championship } from '../competitions/types.ts';
import type { MyAssignmentsPageData } from '../officials/types.ts';
import type { PublicHome } from '../public/types.ts';

export interface AdminHomeProps {
  permissions: readonly string[];
  unreadCount?: number;
}

type BlockState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string };

/**
 * Un bloque del inicio (spec §11): solo pide su ruta si `enabled`, tiene su propia
 * carga/error, y la petición se cancela al salir o al reintentar.
 */
function useBlock<T>(
  enabled: boolean,
  path: string,
): [BlockState<T>, () => void] {
  const [state, setState] = useState<BlockState<T>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiGet<T>(path, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Error desconocido',
          });
      });
    return () => controller.abort();
  }, [enabled, path, attempt]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return [enabled ? state : { kind: 'idle' }, retry];
}

/** Accesos directos a tareas frecuentes, según los permisos del usuario. */
const SHORTCUTS: { permission: string; label: string; href: string }[] = [
  {
    permission: 'athletes:validate',
    label: 'Habilitar deportistas',
    href: '#/deportistas',
  },
  {
    permission: 'results:approve',
    label: 'Revisar y aprobar actas',
    href: '#/campeonatos',
  },
  {
    permission: 'complaints:read',
    label: 'Atender reclamos',
    href: '#/disciplina',
  },
  {
    permission: 'announcements:manage',
    label: 'Publicar noticias',
    href: '#/noticias',
  },
  {
    permission: 'reports:read',
    label: 'Generar reportes',
    href: '#/documentos',
  },
  {
    permission: 'assignments:read_own',
    label: 'Responder mis designaciones',
    href: '#/mis-designaciones',
  },
  { permission: 'users:create', label: 'Crear usuarios', href: '#/usuarios' },
];

const dateTime = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatMatchDate(scheduledAt: string | null): string {
  if (!scheduledAt) return 'Por definir';
  try {
    return dateTime.format(new Date(scheduledAt));
  } catch {
    return scheduledAt;
  }
}

export function AdminHome({ permissions, unreadCount = 0 }: AdminHomeProps) {
  const hasAthletesRead = permissions.includes('athletes:read');
  const hasComplaintsRead = permissions.includes('complaints:read');
  const hasCasesRead = permissions.includes('cases:read');
  const hasChampionshipsRead = permissions.includes('championships:read');
  const hasAssignmentsRead = permissions.includes('assignments:read_own');
  const hasAllClubsAccess = permissions.includes('clubs:access_all');
  const hasAnyAdmin = permissions.some((p) => p !== 'assignments:read_own');

  const [athletes, retryAthletes] = useBlock<Page<unknown>>(
    hasAthletesRead,
    '/athletes?eligibility=pendiente&pageSize=1',
  );
  const [complaints, retryComplaints] = useBlock<Page<unknown>>(
    hasComplaintsRead,
    '/complaints?status=recibido&pageSize=1',
  );
  const [cases, retryCases] = useBlock<Page<unknown>>(
    hasCasesRead,
    '/cases?status=abierto&pageSize=1',
  );
  const [openRegistrations, retryOpenRegistrations] = useBlock<Page<unknown>>(
    hasChampionshipsRead,
    '/championships?status=inscripciones_abiertas&pageSize=1',
  );
  const [activeChampionships, retryActiveChampionships] = useBlock<
    Page<Championship>
  >(hasChampionshipsRead, '/championships?status=en_curso&pageSize=5');
  const [assignments, retryAssignments] = useBlock<MyAssignmentsPageData>(
    hasAssignmentsRead,
    '/assignments/mine?scope=proximas&pageSize=3',
  );
  const [publicHome, retryPublicHome] = useBlock<PublicHome>(
    true,
    '/public/home',
  );

  const athletesLabel = hasAllClubsAccess
    ? 'Deportistas por habilitar'
    : 'Deportistas por habilitar de sus clubes';

  const complaintsLabel = hasAllClubsAccess
    ? 'Reclamos recibidos'
    : 'Reclamos recibidos de sus clubes';

  const shortcuts = SHORTCUTS.filter((s) => permissions.includes(s.permission));

  return (
    <div className="admin-home">
      <header className="admin-home-header">
        <h1 id="home-title">Inicio</h1>
        <p className="admin-home-subtitle">
          Panel de administración de la Liga Deportiva Cantonal de Quero.
        </p>
      </header>

      {!hasAnyAdmin && (
        <div className="admin-callout" role="note">
          <Icon name="info" size={18} />
          <p>
            Su cuenta no tiene permisos de administración. Solicite acceso a un
            administrador de la Liga. Mientras tanto puede cambiar su contraseña
            en «Mi cuenta».
          </p>
        </div>
      )}

      {/* Fila de pendientes: cada tarjeta es un enlace; el reintento queda fuera de él. */}
      <section
        className="admin-metrics-grid"
        aria-label="Métricas y pendientes"
      >
        {hasAthletesRead && (
          <MetricCard
            title={athletesLabel}
            state={athletes}
            href="#/deportistas"
            icon="users"
            onRetry={retryAthletes}
          />
        )}
        {hasComplaintsRead && (
          <MetricCard
            title={complaintsLabel}
            state={complaints}
            href="#/disciplina"
            icon="alert-triangle"
            onRetry={retryComplaints}
          />
        )}
        {hasCasesRead && (
          <MetricCard
            title="Expedientes abiertos"
            state={cases}
            href="#/disciplina"
            icon="file-text"
            onRetry={retryCases}
          />
        )}
        {hasChampionshipsRead && (
          <MetricCard
            title="Inscripciones abiertas"
            state={openRegistrations}
            href="#/campeonatos"
            icon="trophy"
            onRetry={retryOpenRegistrations}
          />
        )}
        <div className="admin-metric-card">
          <a href="#/notificaciones" className="admin-metric-link">
            <span className="admin-metric-header">
              <span className="admin-metric-title">
                Notificaciones sin leer
              </span>
              <Icon name="bell" size={20} />
            </span>
            <span className="admin-metric-value">{unreadCount}</span>
          </a>
        </div>
      </section>

      {shortcuts.length > 0 && (
        <section className="admin-section" aria-labelledby="shortcuts-title">
          <div className="admin-section-header">
            <h2 id="shortcuts-title">Accesos directos</h2>
          </div>
          <ul className="admin-shortcuts">
            {shortcuts.map((s) => (
              <li key={s.permission}>
                <a href={s.href} className="admin-shortcut">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Bloque: Campeonatos en curso */}
      {hasChampionshipsRead && (
        <section
          className="admin-section"
          aria-labelledby="active-championships-title"
        >
          <div className="admin-section-header">
            <h2 id="active-championships-title">Campeonatos en curso</h2>
            <a href="#/campeonatos" className="admin-section-link">
              Ver todos
            </a>
          </div>

          <BlockStatus
            state={activeChampionships}
            loadingText="Cargando campeonatos en curso…"
            onRetry={retryActiveChampionships}
          />

          {activeChampionships.kind === 'ready' &&
            (activeChampionships.data.items.length === 0 ? (
              <EmptyState
                title="No hay campeonatos en curso"
                description="Los campeonatos activos aparecerán aquí para acceso directo."
                icon="trophy"
              />
            ) : (
              <div className="admin-list-container">
                <table className="catalog-table responsive-table">
                  <thead>
                    <tr>
                      <th scope="col">Campeonato</th>
                      <th scope="col">Deporte y categoría</th>
                      <th scope="col">Temporada</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeChampionships.data.items.map((c) => (
                      <tr key={c.id}>
                        <td data-label="Campeonato">
                          <a
                            href={`#/campeonatos/${c.id}`}
                            className="admin-item-link"
                            aria-label={c.name}
                          >
                            <strong>{c.name}</strong>
                          </a>
                        </td>
                        <td data-label="Deporte y categoría">
                          {c.sport.name} · {c.category.name}
                        </td>
                        <td data-label="Temporada">{c.season.name}</td>
                        <td data-label="Estado">
                          <StatusBadge status="en_curso">En curso</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </section>
      )}

      {/* Bloque: Mis designaciones */}
      {hasAssignmentsRead && (
        <section
          className="admin-section"
          aria-labelledby="my-assignments-title"
        >
          <div className="admin-section-header">
            <h2 id="my-assignments-title">Mis designaciones</h2>
            <a href="#/mis-designaciones" className="admin-section-link">
              Ver todas
            </a>
          </div>

          <BlockStatus
            state={assignments}
            loadingText="Cargando designaciones…"
            onRetry={retryAssignments}
          />

          {assignments.kind === 'ready' &&
            (!assignments.data.linked ? (
              <div className="admin-callout" role="note">
                <Icon name="info" size={18} />
                <p>
                  Su cuenta no está vinculada a un árbitro u oficial de mesa.
                </p>
              </div>
            ) : assignments.data.items.length === 0 ? (
              <EmptyState
                title="No tiene designaciones próximas"
                description="Cuando sea designado para un partido, sus asignaciones aparecerán aquí."
                icon="whistle"
              />
            ) : (
              <div className="admin-list-container">
                <table className="catalog-table responsive-table">
                  <thead>
                    <tr>
                      <th scope="col">Partido</th>
                      <th scope="col">Campeonato</th>
                      <th scope="col">Rol</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.data.items.map((a) => (
                      <tr key={a.id}>
                        <td data-label="Partido">
                          <strong>{a.event.match}</strong>
                        </td>
                        <td data-label="Campeonato">{a.championship.name}</td>
                        <td data-label="Rol">{a.roleLabel}</td>
                        <td data-label="Fecha">
                          {formatMatchDate(a.event.scheduledAt)}
                        </td>
                        <td data-label="Estado">
                          <StatusBadge status={a.status}>
                            {a.status === 'designado'
                              ? 'Pendiente'
                              : a.status === 'confirmado'
                                ? 'Confirmada'
                                : 'Rechazada'}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </section>
      )}

      {/* Bloque: Próximos partidos y últimos resultados (público) */}
      <section className="admin-section" aria-labelledby="admin-matches-title">
        <div className="admin-section-header">
          <h2 id="admin-matches-title">Partidos y resultados</h2>
          <a href="#/portal/calendario" className="admin-section-link">
            Calendario completo
          </a>
        </div>

        <BlockStatus
          state={publicHome}
          loadingText="Cargando partidos…"
          onRetry={retryPublicHome}
        />

        {publicHome.kind === 'ready' && (
          <div className="admin-matches-grid">
            <div className="admin-matches-column">
              <h3 className="admin-subheading">Próximos partidos</h3>
              {publicHome.data.upcoming.length === 0 ? (
                <p className="admin-empty-text">
                  No hay partidos programados por ahora.
                </p>
              ) : (
                <div className="admin-match-cards">
                  {publicHome.data.upcoming.slice(0, 6).map((m) => {
                    const local = m.participants.find(
                      (p) => p.side === 'local',
                    );
                    const visitor = m.participants.find(
                      (p) => p.side === 'visitante',
                    );
                    return (
                      <div key={m.id} className="admin-match-card">
                        <div className="admin-match-meta">
                          <span>{m.championship.name}</span>
                          <span className="admin-match-date">
                            {formatMatchDate(m.scheduledAt)}
                          </span>
                        </div>
                        <div className="admin-match-teams">
                          <span>{local ? local.name : 'Por definir'}</span>
                          <span className="admin-match-vs">vs</span>
                          <span>{visitor ? visitor.name : 'Por definir'}</span>
                        </div>
                        {m.venue && (
                          <div className="admin-match-venue">
                            <Icon name="map-pin" size={14} />
                            <span>{m.venue.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="admin-matches-column">
              <h3 className="admin-subheading">Últimos resultados oficiales</h3>
              {publicHome.data.recent.length === 0 ? (
                <p className="admin-empty-text">
                  Aún no hay resultados aprobados.
                </p>
              ) : (
                <div className="admin-match-cards">
                  {publicHome.data.recent.slice(0, 6).map((m) => {
                    const local = m.participants.find(
                      (p) => p.side === 'local',
                    );
                    const visitor = m.participants.find(
                      (p) => p.side === 'visitante',
                    );
                    return (
                      <div key={m.id} className="admin-match-card">
                        <div className="admin-match-meta">
                          <span>{m.championship.name}</span>
                          <span className="admin-match-date">
                            {formatMatchDate(m.scheduledAt)}
                          </span>
                        </div>
                        <div className="admin-match-teams admin-match-scores">
                          <span className="admin-team-name">
                            {local ? local.name : 'Por definir'}
                          </span>
                          <span className="admin-score-display">
                            {local?.score ?? '–'} - {visitor?.score ?? '–'}
                          </span>
                          <span className="admin-team-name">
                            {visitor ? visitor.name : 'Por definir'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Estado del servidor */}
      <ApiStatus />
    </div>
  );
}

interface BlockStatusProps {
  state: BlockState<unknown>;
  loadingText: string;
  onRetry: () => void;
}

/** Carga y error de un bloque de sección, con «Reintentar». */
function BlockStatus({ state, loadingText, onRetry }: BlockStatusProps) {
  if (state.kind === 'loading')
    return (
      <output className="loading" aria-live="polite">
        {loadingText}
      </output>
    );
  if (state.kind === 'error')
    return (
      <div className="state-error" role="alert">
        <p>No se pudo cargar este bloque: {state.message}</p>
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  return null;
}

interface MetricCardProps {
  title: string;
  state: BlockState<Page<unknown>>;
  href: string;
  icon: IconName;
  onRetry: () => void;
}

function MetricCard({ title, state, href, icon, onRetry }: MetricCardProps) {
  return (
    <div className="admin-metric-card">
      <a href={href} className="admin-metric-link">
        <span className="admin-metric-header">
          <span className="admin-metric-title">{title}</span>
          <Icon name={icon} size={20} />
        </span>
        {state.kind === 'loading' && (
          <span className="admin-metric-loading">
            <span aria-hidden="true">…</span>
            <span className="visually-hidden">Cargando</span>
          </span>
        )}
        {state.kind === 'ready' && (
          <span className="admin-metric-value">{state.data.total}</span>
        )}
      </a>
      {state.kind === 'error' && (
        <div className="admin-metric-error" role="alert">
          <span>No se pudo cargar.</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRetry}
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
