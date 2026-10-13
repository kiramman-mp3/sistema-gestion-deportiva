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
          <h2>Tabla de Posiciones Oficial</h2>
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
              <div className="standings-legend">
                {isBasketball && (
                  <>
                    <div>
                      <strong>Victoria FIBA:</strong> 2 pts
                    </div>
                    <div>
                      <strong>Derrota jugada:</strong> 1 pt
                    </div>
                    <div className="standings-tiebreaker">
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
                    <div className="standings-tiebreaker">
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
                    <div className="standings-tiebreaker">
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
                    <div className="standings-tiebreaker">
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
                      <th scope="col" className="standings-pos-col">
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
                        className={
                          row.position === 1
                            ? 'standings-row-leader'
                            : row.position <= 4
                              ? 'standings-row-top'
                              : undefined
                        }
                      >
                        <td data-label="Pos" className="standings-pos-cell">
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
                              <strong className="standings-pts">
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
                            <td data-label="PTS">
                              <strong className="standings-pts">
                                {row.points}
                              </strong>
                            </td>
                          </>
                        ) : isTaekwondo ? (
                          <>
                            <td data-label="Puntos">
                              <strong>{row.goalsFor}</strong>
                            </td>
                            <td data-label="Gam-jeom" className="text-danger">
                              {row.redCards}
                            </td>
                          </>
                        ) : (
                          <>
                            <td data-label="GF">{row.goalsFor}</td>
                            <td data-label="GC">{row.goalsAgainst}</td>
                            <td data-label="DG">
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
                            <td data-label="PTS">
                              <strong className="standings-pts">
                                {row.points}
                              </strong>
                            </td>
                            <td data-label="Juego Limpio">
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
