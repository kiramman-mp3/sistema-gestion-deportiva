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
            Calculada dinámicamente según el reglamento vigente y resultados aprobados por la vocalía técnica.
          </p>
        </div>
        <button
          type="button"
          onClick={reloadStandings}
          className="link-button"
        >
          Actualizar tabla
        </button>
      </div>

      {standingsState.kind === 'loading' && <p>Cargando tabla de posiciones...</p>}

      {standingsState.kind === 'error' && (
        <div className="catalog-error">
          <p>{standingsState.message}</p>
          <button type="button" onClick={reloadStandings}>
            Reintentar
          </button>
        </div>
      )}

      {standingsState.kind === 'ready' && (
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
            }}
          >
            <div>
              <strong>Victoria:</strong> {standingsState.data.rules.pointsWin} pts
            </div>
            <div>
              <strong>Empate:</strong> {standingsState.data.rules.pointsDraw} pts
            </div>
            <div>
              <strong>Derrota:</strong> {standingsState.data.rules.pointsLoss} pts
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
              Criterios de desempate: PTS &gt; DG &gt; GF &gt; Tarjetas
            </div>
          </div>

          {standingsState.data.standings.length === 0 ? (
            <div className="empty-state">
              <p>No hay participantes o partidos finalizados para computar posiciones.</p>
            </div>
          ) : (
            <table className="catalog-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '3rem', textAlign: 'center' }}>Pos</th>
                  <th scope="col">Participante</th>
                  <th scope="col">Club</th>
                  <th scope="col" title="Partidos Jugados">PJ</th>
                  <th scope="col" title="Partidos Ganados">PG</th>
                  <th scope="col" title="Partidos Empatados">PE</th>
                  <th scope="col" title="Partidos Perdidos">PP</th>
                  <th scope="col" title="Goles a Favor">GF</th>
                  <th scope="col" title="Goles en Contra">GC</th>
                  <th scope="col" title="Diferencia de Goles">DG</th>
                  <th scope="col" title="Puntos Oficiales"><strong>PTS</strong></th>
                  <th scope="col" title="Tarjetas Amarillas / Rojas (Juego Limpio)">Juego Limpio</th>
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
                    <td data-label="PE">{row.drawn}</td>
                    <td data-label="PP">{row.lost}</td>
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
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </span>
                    </td>
                    <td data-label="PTS">
                      <strong style={{ fontSize: '1.1rem' }}>{row.points}</strong>
                    </td>
                    <td data-label="Juego Limpio">
                      <span style={{ color: '#d39e00' }}>🟨 {row.yellowCards}</span>
                      {' · '}
                      <span style={{ color: '#dc3545' }}>🟥 {row.redCards}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
