import { useFetch } from '../../hooks/useFetch.ts';
import type { Championship, StandingsResponse } from './types.js';

interface StandingsTabProps {
  championship: Championship;
}

export function StandingsTab({ championship }: StandingsTabProps) {
  const [standingsState, reloadStandings] = useFetch<StandingsResponse>(
    `/championships/${championship.id}/standings`,
  );

  return (
    <div className="tab-panel">
      <div className="catalog-header">
        <div>
          <h3>Tabla de Posiciones Oficial</h3>
          <p className="catalog-intro">
            Calculada dinámicamente según el reglamento vigente (
            {championship.sport.name}) y actas oficiales aprobadas.
          </p>
        </div>
        <button type="button" onClick={reloadStandings} className="link-button">
          Actualizar tabla
        </button>
      </div>

      {standingsState.kind === 'loading' && (
        <p>Cargando tabla de posiciones...</p>
      )}

      {standingsState.kind === 'error' && (
        <div className="catalog-error">
          <p>{standingsState.message}</p>
          <button type="button" onClick={reloadStandings}>
            Reintentar
          </button>
        </div>
      )}

      {standingsState.kind === 'ready' &&
        (() => {
          const sportCode =
            standingsState.data.championship.sportCode ??
            championship.sport.code;
          const isBasketball = sportCode === 'basquet';
          const isChess = sportCode === 'ajedrez';
          const isTaekwondo = sportCode === 'taekwondo';

          return (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: '1.5rem',
                  background: 'var(--surface-sunken)',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  marginBottom: '1.5rem',
                  flexWrap: 'wrap',
                }}
              >
                {isBasketball && (
                  <>
                    <div>
                      <strong>Victoria FIBA:</strong> 2 pts
                    </div>
                    <div>
                      <strong>Derrota jugada:</strong> 1 pt
                    </div>
                    <div
                      style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
                    >
                      Desempate: PTS &gt; DP (Diferencia de puntos) &gt; PF
                      (Puntos a favor)
                    </div>
                  </>
                )}
                {isChess && (
                  <>
                    <div>
                      <strong>Victoria FIDE:</strong> 1.0 pt
                    </div>
                    <div>
                      <strong>Tablas:</strong> 0.5 pt
                    </div>
                    <div>
                      <strong>Derrota:</strong> 0.0 pt
                    </div>
                    <div
                      style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
                    >
                      Desempate: PTS &gt; Buchholz
                    </div>
                  </>
                )}
                {isTaekwondo && (
                  <>
                    <div>
                      <strong>Reglamento:</strong> WT / Eliminatoria y asaltos
                      por puntos
                    </div>
                    <div
                      style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
                    >
                      Criterio: Victorias &gt; Puntos totales &gt; Menos
                      penalizaciones (Gam-jeom)
                    </div>
                  </>
                )}
                {!isBasketball && !isChess && !isTaekwondo && (
                  <>
                    <div>
                      <strong>Victoria:</strong>{' '}
                      {standingsState.data.rules.pointsWin} pts
                    </div>
                    <div>
                      <strong>Empate:</strong>{' '}
                      {standingsState.data.rules.pointsDraw} pts
                    </div>
                    <div>
                      <strong>Derrota:</strong>{' '}
                      {standingsState.data.rules.pointsLoss} pts
                    </div>
                    <div
                      style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
                    >
                      Criterios de desempate: PTS &gt; DG &gt; GF &gt; Tarjetas
                    </div>
                  </>
                )}
              </div>

              {standingsState.data.standings.length === 0 ? (
                <div className="empty-state">
                  <p>
                    No hay participantes o partidos finalizados para computar
                    posiciones.
                  </p>
                </div>
              ) : (
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        style={{ width: '3rem', textAlign: 'center' }}
                      >
                        Pos
                      </th>
                      <th scope="col">Participante</th>
                      <th scope="col">Club</th>
                      <th scope="col" title="Partidos / Combates Jugados">
                        PJ
                      </th>
                      <th scope="col" title="Partidos / Combates Ganados">
                        PG
                      </th>
                      {!isBasketball && !isTaekwondo && (
                        <th scope="col" title="Empatados / Tablas">
                          PE
                        </th>
                      )}
                      <th scope="col" title="Partidos / Combates Perdidos">
                        PP
                      </th>
                      {isChess ? (
                        <>
                          <th scope="col" title="Puntuación Oficial">
                            <strong>PTS</strong>
                          </th>
                          <th scope="col" title="Desempate Buchholz">
                            Buchholz
                          </th>
                        </>
                      ) : isBasketball ? (
                        <>
                          <th scope="col" title="Puntos a Favor">
                            PF
                          </th>
                          <th scope="col" title="Puntos en Contra">
                            PC
                          </th>
                          <th scope="col" title="Diferencia de Puntos">
                            DP
                          </th>
                          <th scope="col" title="Puntos Oficiales FIBA">
                            <strong>PTS</strong>
                          </th>
                        </>
                      ) : isTaekwondo ? (
                        <>
                          <th scope="col" title="Puntos de Asaltos">
                            Puntos
                          </th>
                          <th scope="col" title="Penalizaciones Gam-jeom">
                            Gam-jeom
                          </th>
                        </>
                      ) : (
                        <>
                          <th scope="col" title="Goles a Favor">
                            GF
                          </th>
                          <th scope="col" title="Goles en Contra">
                            GC
                          </th>
                          <th scope="col" title="Diferencia de Goles">
                            DG
                          </th>
                          <th scope="col" title="Puntos Oficiales">
                            <strong>PTS</strong>
                          </th>
                          <th scope="col" title="Juego Limpio">
                            Juego Limpio
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {standingsState.data.standings.map((row) => (
                      <tr
                        key={row.registrationId}
                        style={{
                          background:
                            row.position === 1
                              ? 'rgba(40, 167, 69, 0.08)'
                              : row.position <= 4
                                ? 'rgba(0, 123, 255, 0.04)'
                                : undefined,
                        }}
                      >
                        <td data-label="Pos" style={{ textAlign: 'center' }}>
                          <strong>{row.position}</strong>
                        </td>
                        <td data-label="Participante">
                          <strong>{row.name}</strong>
                        </td>
                        <td data-label="Club">{row.clubName}</td>
                        <td data-label="PJ">{row.played}</td>
                        <td data-label="PG">{row.won}</td>
                        {!isBasketball && !isTaekwondo && (
                          <td data-label="PE">{row.drawn}</td>
                        )}
                        <td data-label="PP">{row.lost}</td>

                        {isChess ? (
                          <>
                            <td data-label="PTS">
                              <strong style={{ fontSize: '1.1rem' }}>
                                {row.points}
                              </strong>
                            </td>
                            <td data-label="Buchholz">{row.buchholz ?? 0}</td>
                          </>
                        ) : isBasketball ? (
                          <>
                            <td data-label="PF">{row.goalsFor}</td>
                            <td data-label="PC">{row.goalsAgainst}</td>
                            <td data-label="DP">
                              <span
                                style={{
                                  color:
                                    row.goalDifference > 0
                                      ? 'var(--success-text)'
                                      : row.goalDifference < 0
                                        ? 'var(--danger-text)'
                                        : undefined,
                                  fontWeight: 'bold',
                                }}
                              >
                                {row.goalDifference > 0
                                  ? `+${row.goalDifference}`
                                  : row.goalDifference}
                              </span>
                            </td>
                            <td data-label="PTS">
                              <strong style={{ fontSize: '1.1rem' }}>
                                {row.points}
                              </strong>
                            </td>
                          </>
                        ) : isTaekwondo ? (
                          <>
                            <td data-label="Puntos">
                              <strong>{row.goalsFor}</strong>
                            </td>
                            <td
                              data-label="Gam-jeom"
                              style={{ color: '#dc3545' }}
                            >
                              {row.redCards}
                            </td>
                          </>
                        ) : (
                          <>
                            <td data-label="GF">{row.goalsFor}</td>
                            <td data-label="GC">{row.goalsAgainst}</td>
                            <td data-label="DG">
                              <span
                                style={{
                                  color:
                                    row.goalDifference > 0
                                      ? 'var(--success-text)'
                                      : row.goalDifference < 0
                                        ? 'var(--danger-text)'
                                        : undefined,
                                  fontWeight: 'bold',
                                }}
                              >
                                {row.goalDifference > 0
                                  ? `+${row.goalDifference}`
                                  : row.goalDifference}
                              </span>
                            </td>
                            <td data-label="PTS">
                              <strong style={{ fontSize: '1.1rem' }}>
                                {row.points}
                              </strong>
                            </td>
                            <td data-label="Juego Limpio">
                              <span style={{ color: '#d39e00' }}>
                                🟨 {row.yellowCards}
                              </span>
                              {' · '}
                              <span style={{ color: '#dc3545' }}>
                                🟥 {row.redCards}
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          );
        })()}
    </div>
  );
}
