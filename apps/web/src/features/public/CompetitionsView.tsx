import { useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { Tabs } from '../../components/Tabs.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import type {
  PublicChampionship,
  PublicChampionshipsResponse,
  PublicStage,
  PublicStandingsResponse,
} from './types.ts';

interface CompetitionsViewProps {
  championshipId?: string;
  onOpenPrintDocument?: (kind: 'acta' | 'nomina', id: string) => void;
}

/** Campeonatos oficiales con su calendario, resultados y tabla de posiciones. */
export function CompetitionsView({
  championshipId,
  onOpenPrintDocument,
}: CompetitionsViewProps) {
  const [selectedSport, setSelectedSport] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const queryParams = new URLSearchParams();
  if (searchQuery.trim()) queryParams.set('q', searchQuery.trim());
  const queryString = queryParams.toString()
    ? `?${queryParams.toString()}`
    : '';

  const [championshipsState] = useFetch<PublicChampionshipsResponse>(
    `/public/championships${queryString}`,
  );

  // Filtrado en memoria por deporte
  const allChampionships =
    championshipsState.kind === 'ready' ? championshipsState.data.items : [];
  const filteredChampionships = allChampionships.filter((c) => {
    if (selectedSport === 'all') return true;
    return c.sport.code === selectedSport;
  });

  const sportFilters = [
    { code: 'all', label: 'Todos los deportes' },
    ...[
      ...new Map(allChampionships.map((c) => [c.sport.code, c.sport])).values(),
    ].map((sport) => ({
      code: sport.code,
      label: sport.name,
    })),
  ];

  const selectedChampionship = championshipId
    ? allChampionships.find((c) => c.id === championshipId)
    : null;

  const handleSelectChamp = (id: string) => {
    window.location.hash = `#/portal/competencias/${id}`;
  };

  const handleBack = () => {
    window.location.hash = '#/portal/competencias';
  };

  const handleOpenPrint = (kind: 'acta' | 'nomina', id: string) => {
    if (onOpenPrintDocument) {
      onOpenPrintDocument(kind, id);
    } else {
      window.location.hash = `#/imprimir/${kind}/${id}`;
    }
  };

  return (
    <div className="public-portal">
      {/* Si hay un campeonato seleccionado, muestra la vista detallada */}
      {championshipId ? (
        championshipsState.kind === 'loading' ? (
          <div className="section-header">
            <p>
              <button
                type="button"
                onClick={handleBack}
                className="secondary-button"
              >
                ← Volver al listado
              </button>
            </p>
            <output>Cargando información del campeonato…</output>
          </div>
        ) : selectedChampionship ? (
          <ChampionshipDetailView
            championship={selectedChampionship}
            onBack={handleBack}
            onOpenPrint={handleOpenPrint}
          />
        ) : (
          <div className="section-header">
            <p>
              <button
                type="button"
                onClick={handleBack}
                className="secondary-button"
              >
                ← Volver al listado
              </button>
            </p>
            <div className="catalog-error" role="alert">
              <p>Campeonato no encontrado o no disponible públicamente.</p>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="section-header">
            <h1 className="portal-page-title">Competencias</h1>
          </div>
          {/* Barra de Filtros por Deporte y Búsqueda */}
          <section
            className="portal-controls"
            aria-label="Filtros de competencias"
          >
            <div className="sport-tabs">
              {sportFilters.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  className={`sport-tab-button ${selectedSport === s.code ? 'active' : ''}`}
                  onClick={() => setSelectedSport(s.code)}
                  aria-pressed={selectedSport === s.code}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="search-box">
              <input
                type="search"
                placeholder="Buscar campeonato por nombre…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Buscar campeonato"
              />
            </div>
          </section>

          {/* Listado de Campeonatos */}
          <section
            className="portal-section"
            aria-labelledby="campeonatos-heading"
          >
            <div className="section-header">
              <h3 id="campeonatos-heading">Campeonatos Oficiales</h3>
              <span className="count-badge">
                {filteredChampionships.length}{' '}
                {filteredChampionships.length === 1
                  ? 'competencia'
                  : 'competencias'}
              </span>
            </div>

            {championshipsState.kind === 'loading' && (
              <output>Cargando información de competencias…</output>
            )}

            {championshipsState.kind === 'error' && (
              <div className="catalog-error">
                <p>
                  No se pudo cargar los campeonatos:{' '}
                  {championshipsState.message}
                </p>
              </div>
            )}

            {championshipsState.kind === 'ready' &&
              filteredChampionships.length === 0 && (
                <div className="empty-state">
                  <p>
                    No se encontraron campeonatos para el filtro seleccionado.
                  </p>
                </div>
              )}

            <div className="championships-grid">
              {filteredChampionships.map((champ) => (
                <article key={champ.id} className="championship-card">
                  <div className="card-top">
                    <span className="sport-tag">
                      {champ.sport.name} · {champ.category.name}
                    </span>
                    <span className={`status-badge status-${champ.status}`}>
                      {champ.status === 'en_curso' && 'En curso'}
                      {champ.status === 'finalizado' && 'Finalizado'}
                      {champ.status === 'inscripciones_abiertas' &&
                        'Inscripciones abiertas'}
                      {champ.status === 'inscripciones_cerradas' &&
                        'Inscripciones cerradas'}
                    </span>
                  </div>

                  <h4 className="champ-title">{champ.name}</h4>
                  <p className="season-meta">
                    Temporada: <strong>{champ.season.name}</strong>
                  </p>

                  <div className="champ-stats">
                    <div className="stat">
                      <span className="stat-label">Inscritos</span>
                      <span className="stat-value">
                        {champ._count.registrations}
                      </span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Modalidad</span>
                      <span className="stat-value format-val">
                        {champ.format.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectChamp(champ.id)}
                    className="primary-button full-width"
                  >
                    Ver Calendario y Posiciones →
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ChampionshipDetailView({
  championship,
  onBack,
  onOpenPrint,
}: {
  championship: PublicChampionship;
  onBack: () => void;
  onOpenPrint: (kind: 'acta' | 'nomina', id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<
    'fixtures' | 'standings' | 'rules'
  >('fixtures');

  const [fixturesState, reloadFixtures] = useFetch<PublicStage[]>(
    `/public/championships/${championship.id}/fixtures`,
  );

  const [standingsState, reloadStandings] = useFetch<PublicStandingsResponse>(
    `/public/championships/${championship.id}/standings`,
  );

  return (
    <div className="champ-detail-view">
      <div className="detail-top-nav">
        <button type="button" onClick={onBack} className="secondary-button">
          ← Volver al listado
        </button>
      </div>

      <header className="champ-detail-header">
        <span className="sport-tag">
          {championship.sport.name} · {championship.category.name} ·{' '}
          {championship.season.name}
        </span>
        <h1>{championship.name}</h1>
        <div className="champ-tags">
          <span className="badge">
            Modalidad: {championship.format.replace(/_/g, ' ')}
          </span>
          <span className="badge">
            Estado: {championship.status.replace(/_/g, ' ')}
          </span>
        </div>
      </header>

      {/* Tabs */}
      <Tabs
        ariaLabel="Detalles del campeonato"
        activeId={activeTab}
        onChange={(id) =>
          setActiveTab(id as 'fixtures' | 'standings' | 'rules')
        }
        className="detail-tabs"
        items={[
          {
            id: 'fixtures',
            label: (
              <>
                <Icon name="calendar" /> Calendario y Resultados
              </>
            ),
            content: (
              <section
                className="tab-panel"
                aria-label="Calendario y resultados"
              >
                <div className="panel-actions">
                  <h4>Encuentros y Jornadas Oficiales</h4>
                  <span className="row-actions">
                    <a
                      href={`/api/public/championships/${championship.id}/export/fixtures?format=pdf`}
                    >
                      PDF
                    </a>
                    <a
                      href={`/api/public/championships/${championship.id}/export/fixtures?format=csv`}
                    >
                      CSV
                    </a>
                  </span>
                  <button
                    type="button"
                    onClick={reloadFixtures}
                    className="link-button"
                  >
                    Actualizar
                  </button>
                </div>

                {fixturesState.kind === 'loading' && (
                  <output>Cargando calendario oficial…</output>
                )}
                {fixturesState.kind === 'error' && (
                  <div className="catalog-error">
                    <p>Error: {fixturesState.message}</p>
                  </div>
                )}

                {fixturesState.kind === 'ready' &&
                  fixturesState.data.length === 0 && (
                    <div className="empty-state">
                      <p>
                        No hay etapas o partidos programados para este
                        campeonato.
                      </p>
                    </div>
                  )}

                {fixturesState.kind === 'ready' &&
                  fixturesState.data.map((stage) => (
                    <div key={stage.id} className="stage-block">
                      <h4 className="stage-title">{stage.name}</h4>
                      {stage.rounds.map((round) => (
                        <div key={round.id} className="round-block">
                          <h5 className="round-title">{round.name}</h5>
                          <div className="matches-grid">
                            {round.events.map((event) => {
                              const local = event.participants.find(
                                (p) => p.side === 'local',
                              );
                              const away = event.participants.find(
                                (p) => p.side === 'visitante',
                              );
                              const isApproved = event.result !== null;

                              return (
                                <div key={event.id} className="match-card">
                                  <div className="match-meta">
                                    <span className="match-venue">
                                      <Icon name="map-pin" />{' '}
                                      {event.venue?.name ?? 'Por confirmar'}
                                    </span>
                                    <span className="match-date">
                                      <Icon name="clock" />{' '}
                                      {event.scheduledAt
                                        ? new Date(
                                            event.scheduledAt,
                                          ).toLocaleString('es-EC', {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                          })
                                        : 'Fecha por definir'}
                                    </span>
                                    <span
                                      className={`match-status-pill status-${event.status}`}
                                    >
                                      {event.status}
                                    </span>
                                  </div>

                                  <div className="match-teams-row">
                                    <div className="match-team local">
                                      <span className="team-name">
                                        {local?.name ?? 'Por definir'}
                                      </span>
                                      <small className="team-club">
                                        {local?.clubName}
                                      </small>
                                    </div>

                                    <div className="match-score">
                                      {isApproved ? (
                                        <span className="score-numbers">
                                          {local?.score ?? 0} —{' '}
                                          {away?.score ?? 0}
                                        </span>
                                      ) : (
                                        <span className="vs-badge">VS</span>
                                      )}
                                    </div>

                                    <div className="match-team away">
                                      <span className="team-name">
                                        {away?.name ?? 'Por definir'}
                                      </span>
                                      <small className="team-club">
                                        {away?.clubName}
                                      </small>
                                    </div>
                                  </div>

                                  <div className="match-footer-actions">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenPrint('acta', event.id)
                                      }
                                      className="print-link-button"
                                    >
                                      <Icon name="printer" /> Ver / Imprimir
                                      Acta Oficial
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
              </section>
            ),
          },
          {
            id: 'standings',
            label: (
              <>
                <Icon name="table" /> Tabla de Posiciones Oficial
              </>
            ),
            content: (
              <section className="tab-panel" aria-label="Tabla de posiciones">
                <div className="panel-actions">
                  <h4>Tabla de Posiciones Oficial</h4>
                  <span className="row-actions">
                    <a
                      href={`/api/public/championships/${championship.id}/export/standings?format=pdf`}
                    >
                      PDF
                    </a>
                    <a
                      href={`/api/public/championships/${championship.id}/export/standings?format=csv`}
                    >
                      CSV
                    </a>
                  </span>
                  <button
                    type="button"
                    onClick={reloadStandings}
                    className="link-button"
                  >
                    Actualizar
                  </button>
                </div>

                {standingsState.kind === 'loading' && (
                  <output>Calculando tabla de posiciones…</output>
                )}
                {standingsState.kind === 'error' && (
                  <div className="catalog-error">
                    <p>Error: {standingsState.message}</p>
                  </div>
                )}

                {standingsState.kind === 'ready' && (
                  <div className="standings-table-container">
                    <table className="portal-table responsive-table">
                      <thead>
                        <tr>
                          <th>Pos</th>
                          <th>Participante</th>
                          <th>Club</th>
                          <th title="Partidos Jugados">PJ</th>
                          <th title="Partidos Ganados">PG</th>
                          <th title="Partidos Empatados">PE</th>
                          <th title="Partidos Perdidos">PP</th>
                          <th title="Goles / Puntos a favor">GF</th>
                          <th title="Goles / Puntos en contra">GC</th>
                          <th title="Diferencia de goles / puntos">DG</th>
                          <th title="Puntos oficiales">Pts</th>
                          <th title="Juego Limpio">Juego Limpio</th>
                          <th>Nómina Oficial</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standingsState.data.standings.map((row) => (
                          <tr
                            key={row.registrationId}
                            className={[
                              row.position === 1 ? 'standings-row-leader' : '',
                              row.position <= 2 ? 'top-row' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <td
                              data-label="Pos"
                              className="center bold standings-pos-cell"
                            >
                              {row.position}°
                            </td>
                            <td data-label="Participante" className="bold">
                              {row.name}
                            </td>
                            <td data-label="Club">{row.clubName}</td>
                            <td data-label="PJ" className="center">
                              {row.played}
                            </td>
                            <td data-label="PG" className="center">
                              {row.won}
                            </td>
                            <td data-label="PE" className="center">
                              {row.drawn}
                            </td>
                            <td data-label="PP" className="center">
                              {row.lost}
                            </td>
                            <td data-label="GF" className="center">
                              {row.goalsFor}
                            </td>
                            <td data-label="GC" className="center">
                              {row.goalsAgainst}
                            </td>
                            <td data-label="DG" className="center">
                              <span
                                className={`standings-diff ${
                                  row.goalDifference > 0
                                    ? 'diff-positive'
                                    : row.goalDifference < 0
                                      ? 'diff-negative'
                                      : ''
                                }`.trim()}
                              >
                                {row.goalDifference > 0
                                  ? `+${row.goalDifference}`
                                  : row.goalDifference}
                              </span>
                            </td>
                            <td
                              data-label="Pts"
                              className="center bold pts-cell"
                            >
                              <strong className="standings-pts">
                                {row.points}
                              </strong>
                            </td>
                            <td data-label="Juego Limpio" className="center">
                              <span className="fair-play-item">
                                <span
                                  className="card-shape yellow-card-shape"
                                  aria-hidden="true"
                                />
                                <span className="visually-hidden">
                                  Amarillas:{' '}
                                </span>
                                {row.yellowCards}
                              </span>
                              {' · '}
                              <span className="fair-play-item">
                                <span
                                  className="card-shape red-card-shape"
                                  aria-hidden="true"
                                />
                                <span className="visually-hidden">Rojas: </span>
                                {row.redCards}
                              </span>
                            </td>
                            <td data-label="Nómina" className="center">
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenPrint('nomina', row.registrationId)
                                }
                                className="action-link"
                              >
                                <Icon name="file-text" /> Ver Nómina
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ),
          },
          {
            id: 'rules',
            label: (
              <>
                <Icon name="file-text" /> Información y Reglamentos
              </>
            ),
            content: (
              <section
                className="tab-panel"
                aria-label="Información y reglamento"
              >
                <div className="rules-info-box">
                  <h4>Bases y Reglamento del Campeonato</h4>
                  <p>
                    Campeonato oficial regido por las directrices de la{' '}
                    <strong>Liga Deportiva Cantonal de Quero</strong> y las
                    federaciones deportivas ecuatorianas correspondientes.
                  </p>
                  <ul>
                    <li>
                      <strong>Deporte:</strong> {championship.sport.name}
                    </li>
                    <li>
                      <strong>Categoría:</strong> {championship.category.name}
                    </li>
                    <li>
                      <strong>Modalidad de competencia:</strong>{' '}
                      {championship.format.replace(/_/g, ' ')}
                    </li>
                    <li>
                      <strong>Puntuación oficial:</strong> Reglamentada por acta
                      aprobada
                    </li>
                    <li>
                      <strong>Criterios de Desempate:</strong> Diferencia de
                      goles/puntos, mayor cantidad de goles/puntos a favor,
                      juego limpio (tarjetas amarillas y rojas) y confrontación
                      directa.
                    </li>
                  </ul>
                </div>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
