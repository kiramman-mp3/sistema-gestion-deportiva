import { useEffect, useState } from 'react';
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
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string };

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

  const [athletesState, setAthletesState] = useState<BlockState<number>>({
    kind: 'loading',
  });
  const [complaintsState, setComplaintsState] = useState<BlockState<number>>({
    kind: 'loading',
  });
  const [casesState, setCasesState] = useState<BlockState<number>>({
    kind: 'loading',
  });
  const [openRegState, setOpenRegState] = useState<BlockState<number>>({
    kind: 'loading',
  });
  const [activeChampionshipsState, setActiveChampionshipsState] = useState<
    BlockState<Championship[]>
  >({ kind: 'loading' });
  const [assignmentsState, setAssignmentsState] = useState<
    BlockState<MyAssignmentsPageData>
  >({ kind: 'loading' });
  const [publicHomeState, setPublicHomeState] = useState<
    BlockState<PublicHome>
  >({ kind: 'loading' });

  // Disparar las solicitudes en paralelo respetando permisos y AbortController
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    if (hasAthletesRead) {
      apiGet<Page<unknown>>(
        '/athletes?eligibility=pendiente&pageSize=1',
        signal,
      )
        .then((res) => {
          if (!signal.aborted)
            setAthletesState({ kind: 'ready', data: res.total });
        })
        .catch((err: unknown) => {
          if (!signal.aborted) {
            setAthletesState({
              kind: 'error',
              message:
                err instanceof Error
                  ? err.message
                  : 'Error al cargar deportistas',
            });
          }
        });
    }

    if (hasComplaintsRead) {
      apiGet<Page<unknown>>('/complaints?status=recibido&pageSize=1', signal)
        .then((res) => {
          if (!signal.aborted)
            setComplaintsState({ kind: 'ready', data: res.total });
        })
        .catch((err: unknown) => {
          if (!signal.aborted) {
            setComplaintsState({
              kind: 'error',
              message:
                err instanceof Error ? err.message : 'Error al cargar reclamos',
            });
          }
        });
    }

    if (hasCasesRead) {
      apiGet<Page<unknown>>('/cases?status=abierto&pageSize=1', signal)
        .then((res) => {
          if (!signal.aborted)
            setCasesState({ kind: 'ready', data: res.total });
        })
        .catch((err: unknown) => {
          if (!signal.aborted) {
            setCasesState({
              kind: 'error',
              message:
                err instanceof Error
                  ? err.message
                  : 'Error al cargar expedientes',
            });
          }
        });
    }

    if (hasChampionshipsRead) {
      apiGet<Page<unknown>>(
        '/championships?status=inscripciones_abiertas&pageSize=1',
        signal,
      )
        .then((res) => {
          if (!signal.aborted)
            setOpenRegState({ kind: 'ready', data: res.total });
        })
        .catch((err: unknown) => {
          if (!signal.aborted) {
            setOpenRegState({
              kind: 'error',
              message:
                err instanceof Error
                  ? err.message
                  : 'Error al cargar inscripciones',
            });
          }
        });

      apiGet<Page<Championship>>(
        '/championships?status=en_curso&pageSize=5',
        signal,
      )
        .then((res) => {
          if (!signal.aborted)
            setActiveChampionshipsState({ kind: 'ready', data: res.items });
        })
        .catch((err: unknown) => {
          if (!signal.aborted) {
            setActiveChampionshipsState({
              kind: 'error',
              message:
                err instanceof Error
                  ? err.message
                  : 'Error al cargar campeonatos',
            });
          }
        });
    }

    if (hasAssignmentsRead) {
      apiGet<MyAssignmentsPageData>(
        '/assignments/mine?scope=proximas&pageSize=3',
        signal,
      )
        .then((res) => {
          if (!signal.aborted)
            setAssignmentsState({ kind: 'ready', data: res });
        })
        .catch((err: unknown) => {
          if (!signal.aborted) {
            setAssignmentsState({
              kind: 'error',
              message:
                err instanceof Error
                  ? err.message
                  : 'Error al cargar designaciones',
            });
          }
        });
    }

    // El bloque público siempre se carga
    apiGet<PublicHome>('/public/home', signal)
      .then((res) => {
        if (!signal.aborted) setPublicHomeState({ kind: 'ready', data: res });
      })
      .catch((err: unknown) => {
        if (!signal.aborted) {
          setPublicHomeState({
            kind: 'error',
            message:
              err instanceof Error
                ? err.message
                : 'Error al cargar partidos públicos',
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    hasAthletesRead,
    hasComplaintsRead,
    hasCasesRead,
    hasChampionshipsRead,
    hasAssignmentsRead,
  ]);

  const athletesLabel = hasAllClubsAccess
    ? 'Deportistas por habilitar'
    : 'Deportistas por habilitar de sus clubes';

  const complaintsLabel = hasAllClubsAccess
    ? 'Reclamos recibidos'
    : 'Reclamos recibidos de sus clubes';

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

      {/* Fila de tarjetas de métricas / pendientes */}
      <section
        className="admin-metrics-grid"
        aria-label="Métricas y pendientes"
      >
        {hasAthletesRead && (
          <MetricCard
            title={athletesLabel}
            state={athletesState}
            href="#/deportistas"
            icon="users"
            onRetry={() => {
              setAthletesState({ kind: 'loading' });
              apiGet<Page<unknown>>(
                '/athletes?eligibility=pendiente&pageSize=1',
              )
                .then((res) =>
                  setAthletesState({ kind: 'ready', data: res.total }),
                )
                .catch((err: unknown) =>
                  setAthletesState({
                    kind: 'error',
                    message: err instanceof Error ? err.message : 'Error',
                  }),
                );
            }}
          />
        )}

        {hasComplaintsRead && (
          <MetricCard
            title={complaintsLabel}
            state={complaintsState}
            href="#/disciplina"
            icon="alert-triangle"
            onRetry={() => {
              setComplaintsState({ kind: 'loading' });
              apiGet<Page<unknown>>('/complaints?status=recibido&pageSize=1')
                .then((res) =>
                  setComplaintsState({ kind: 'ready', data: res.total }),
                )
                .catch((err: unknown) =>
                  setComplaintsState({
                    kind: 'error',
                    message: err instanceof Error ? err.message : 'Error',
                  }),
                );
            }}
          />
        )}

        {hasCasesRead && (
          <MetricCard
            title="Expedientes abiertos"
            state={casesState}
            href="#/disciplina"
            icon="file-text"
            onRetry={() => {
              setCasesState({ kind: 'loading' });
              apiGet<Page<unknown>>('/cases?status=abierto&pageSize=1')
                .then((res) =>
                  setCasesState({ kind: 'ready', data: res.total }),
                )
                .catch((err: unknown) =>
                  setCasesState({
                    kind: 'error',
                    message: err instanceof Error ? err.message : 'Error',
                  }),
                );
            }}
          />
        )}

        {hasChampionshipsRead && (
          <MetricCard
            title="Inscripciones abiertas"
            state={openRegState}
            href="#/campeonatos"
            icon="trophy"
            onRetry={() => {
              setOpenRegState({ kind: 'loading' });
              apiGet<Page<unknown>>(
                '/championships?status=inscripciones_abiertas&pageSize=1',
              )
                .then((res) =>
                  setOpenRegState({ kind: 'ready', data: res.total }),
                )
                .catch((err: unknown) =>
                  setOpenRegState({
                    kind: 'error',
                    message: err instanceof Error ? err.message : 'Error',
                  }),
                );
            }}
          />
        )}

        <a
          href="#/notificaciones"
          className="admin-metric-card"
          aria-label={`Avisos pendientes (${unreadCount})`}
        >
          <div className="admin-metric-header">
            <span className="admin-metric-title">Notificaciones sin leer</span>
            <Icon name="bell" size={20} />
          </div>
          <div className="admin-metric-value">{unreadCount}</div>
        </a>
      </section>

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

          {activeChampionshipsState.kind === 'loading' && (
            <output className="loading" aria-live="polite">
              Cargando campeonatos en curso…
            </output>
          )}

          {activeChampionshipsState.kind === 'error' && (
            <div className="state-error" role="alert">
              <p>{activeChampionshipsState.message}</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setActiveChampionshipsState({ kind: 'loading' });
                  apiGet<Page<Championship>>(
                    '/championships?status=en_curso&pageSize=5',
                  )
                    .then((res) =>
                      setActiveChampionshipsState({
                        kind: 'ready',
                        data: res.items,
                      }),
                    )
                    .catch((err: unknown) =>
                      setActiveChampionshipsState({
                        kind: 'error',
                        message: err instanceof Error ? err.message : 'Error',
                      }),
                    );
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {activeChampionshipsState.kind === 'ready' &&
            (activeChampionshipsState.data.length === 0 ? (
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
                      <th scope="col">Deporte y Categoría</th>
                      <th scope="col">Temporada</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeChampionshipsState.data.map((c) => (
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
                        <td data-label="Deporte y Categoría">
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

          {assignmentsState.kind === 'loading' && (
            <output className="loading" aria-live="polite">
              Cargando designaciones…
            </output>
          )}

          {assignmentsState.kind === 'error' && (
            <div className="state-error" role="alert">
              <p>{assignmentsState.message}</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setAssignmentsState({ kind: 'loading' });
                  apiGet<MyAssignmentsPageData>(
                    '/assignments/mine?scope=proximas&pageSize=3',
                  )
                    .then((res) =>
                      setAssignmentsState({ kind: 'ready', data: res }),
                    )
                    .catch((err: unknown) =>
                      setAssignmentsState({
                        kind: 'error',
                        message: err instanceof Error ? err.message : 'Error',
                      }),
                    );
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {assignmentsState.kind === 'ready' &&
            (!assignmentsState.data.linked ? (
              <div className="admin-callout" role="note">
                <Icon name="info" size={18} />
                <p>
                  Su cuenta no está vinculada a un árbitro u oficial de mesa.
                </p>
              </div>
            ) : assignmentsState.data.items.length === 0 ? (
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
                    {assignmentsState.data.items.map((a) => (
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

        {publicHomeState.kind === 'loading' && (
          <output className="loading" aria-live="polite">
            Cargando partidos…
          </output>
        )}

        {publicHomeState.kind === 'error' && (
          <div className="state-error" role="alert">
            <p>{publicHomeState.message}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setPublicHomeState({ kind: 'loading' });
                apiGet<PublicHome>('/public/home')
                  .then((res) =>
                    setPublicHomeState({ kind: 'ready', data: res }),
                  )
                  .catch((err: unknown) =>
                    setPublicHomeState({
                      kind: 'error',
                      message: err instanceof Error ? err.message : 'Error',
                    }),
                  );
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {publicHomeState.kind === 'ready' && (
          <div className="admin-matches-grid">
            <div className="admin-matches-column">
              <h3 className="admin-subheading">Próximos partidos</h3>
              {publicHomeState.data.upcoming.length === 0 ? (
                <p className="admin-empty-text">
                  No hay partidos programados por ahora.
                </p>
              ) : (
                <div className="admin-match-cards">
                  {publicHomeState.data.upcoming.slice(0, 6).map((m) => {
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
              {publicHomeState.data.recent.length === 0 ? (
                <p className="admin-empty-text">
                  Aún no hay resultados aprobados.
                </p>
              ) : (
                <div className="admin-match-cards">
                  {publicHomeState.data.recent.slice(0, 6).map((m) => {
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
                            {local ? local.name : 'Equipo'}
                          </span>
                          <span className="admin-score-display">
                            {local?.score ?? 0} - {visitor?.score ?? 0}
                          </span>
                          <span className="admin-team-name">
                            {visitor ? visitor.name : 'Equipo'}
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

interface MetricCardProps {
  title: string;
  state: BlockState<number>;
  href: string;
  icon: IconName;
  onRetry: () => void;
}

function MetricCard({ title, state, href, icon, onRetry }: MetricCardProps) {
  return (
    <a href={href} className="admin-metric-card">
      <div className="admin-metric-header">
        <span className="admin-metric-title">{title}</span>
        <Icon name={icon} size={20} />
      </div>
      <div className="admin-metric-body">
        {state.kind === 'loading' && (
          <span className="admin-metric-loading" aria-label="Cargando">
            …
          </span>
        )}
        {state.kind === 'ready' && (
          <span className="admin-metric-value">{state.data}</span>
        )}
        {state.kind === 'error' && (
          <div className="admin-metric-error">
            <span>Error</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRetry();
              }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </a>
  );
}
