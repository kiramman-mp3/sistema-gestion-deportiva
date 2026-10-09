import { useFetch } from '../../hooks/useFetch.ts';
import type { RosterPrintData, ScoresheetPrintData } from './types.ts';

interface PrintDocumentViewProps {
  kind: 'acta' | 'nomina';
  id: string;
  onBack: () => void;
}

export function PrintDocumentView({ kind, id, onBack }: PrintDocumentViewProps) {
  const endpoint =
    kind === 'acta'
      ? `/public/events/${id}/scoresheet`
      : `/public/registrations/${id}/roster`;

  const [state] = useFetch<ScoresheetPrintData | RosterPrintData>(endpoint);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="printable-page-container">
      <div className="print-toolbar no-print">
        <button type="button" onClick={onBack} className="secondary-button">
          ← Volver al portal
        </button>
        <button type="button" onClick={handlePrint} className="primary-button">
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      {state.kind === 'loading' && (
        <output className="no-print">Cargando documento oficial…</output>
      )}

      {state.kind === 'error' && (
        <div className="catalog-error no-print">
          <p>No se pudo cargar el documento: {state.message}</p>
          <button type="button" onClick={onBack}>
            Volver
          </button>
        </div>
      )}

      {state.kind === 'ready' && kind === 'acta' && (
        <ScoresheetDocument
          data={state.data as ScoresheetPrintData}
          onPrint={handlePrint}
        />
      )}

      {state.kind === 'ready' && kind === 'nomina' && (
        <RosterDocument
          data={state.data as RosterPrintData}
          onPrint={handlePrint}
        />
      )}
    </div>
  );
}

function ScoresheetDocument({
  data,
}: {
  data: ScoresheetPrintData;
  onPrint: () => void;
}) {
  const localParticipant = data.participants.find((p) => p.side === 'local') ?? data.participants[0];
  const awayParticipant = data.participants.find((p) => p.side === 'visitante') ?? data.participants[1];

  return (
    <article className="institutional-sheet">
      <header className="institutional-header">
        <div className="header-seal">
          <div className="seal-emblem">⚽🏀🥋♟️</div>
        </div>
        <div className="header-text">
          <p className="republic-text">REPÚBLICA DEL ECUADOR</p>
          <h1 className="league-title">{data.documentMetadata.institution}</h1>
          <p className="affiliation-text">{data.documentMetadata.affiliation}</p>
          <p className="location-text">{data.documentMetadata.canton}</p>
          <h2 className="document-subtitle">{data.documentMetadata.title}</h2>
        </div>
      </header>

      <section className="document-meta-grid" aria-label="Datos del encuentro">
        <div className="meta-item">
          <strong>Campeonato:</strong> {data.championship.name}
        </div>
        <div className="meta-item">
          <strong>Deporte / Categoría:</strong> {data.championship.sport} ({data.championship.category})
        </div>
        <div className="meta-item">
          <strong>Etapa / Jornada:</strong> {data.stage} · {data.round}
        </div>
        <div className="meta-item">
          <strong>Escenario:</strong> {data.venue} {data.venueAddress ? `(${data.venueAddress})` : ''}
        </div>
        <div className="meta-item">
          <strong>Fecha y hora:</strong>{' '}
          {data.scheduledAt ? new Date(data.scheduledAt).toLocaleString('es-EC') : 'Por programar'}
        </div>
        <div className="meta-item">
          <strong>Estado oficial:</strong>{' '}
          <span className="status-tag">{data.status.toUpperCase()}</span>
        </div>
      </section>

      {/* Marcador Oficial */}
      <section className="scoresheet-scoreboard" aria-label="Marcador oficial">
        <div className="team-box local">
          <span className="side-label">LOCAL</span>
          <h3 className="team-name">{localParticipant?.name ?? 'Por definir'}</h3>
          <p className="team-club">{localParticipant?.clubName}</p>
          <div className="score-display">
            {localParticipant?.score !== null && localParticipant?.score !== undefined
              ? localParticipant.score
              : '-'}
          </div>
        </div>

        <div className="vs-divider">VS</div>

        <div className="team-box away">
          <span className="side-label">VISITANTE</span>
          <h3 className="team-name">{awayParticipant?.name ?? 'Por definir'}</h3>
          <p className="team-club">{awayParticipant?.clubName}</p>
          <div className="score-display">
            {awayParticipant?.score !== null && awayParticipant?.score !== undefined
              ? awayParticipant.score
              : '-'}
          </div>
        </div>
      </section>

      {/* Puntuación por períodos o asaltos si existen */}
      {data.result?.periodScores && data.result.periodScores.length > 0 && (
        <section className="subscores-section">
          <h4>Puntuación por Períodos (Básquetbol)</h4>
          <table className="print-table">
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Q1</th>
                <th>Q2</th>
                <th>Q3</th>
                <th>Q4</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.participants.map((p) => {
                const scores = data.result?.periodScores?.filter((ps) => ps.score !== undefined) ?? [];
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    {[1, 2, 3, 4].map((q) => {
                      const matchPeriod = scores.find((ps) => ps.periodNumber === q);
                      return <td key={q}>{matchPeriod?.score ?? '-'}</td>;
                    })}
                    <td><strong>{p.score ?? '-'}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Incidencias de fútbol si existen */}
      {data.result?.footballEvents && data.result.footballEvents.length > 0 && (
        <section className="subscores-section">
          <h4>Incidencias Registradas (Goles y Tarjetas)</h4>
          <table className="print-table">
            <thead>
              <tr>
                <th>Minuto</th>
                <th>Incidencia</th>
                <th>Deportista</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {data.result.footballEvents.map((fe, idx) => (
                <tr key={idx}>
                  <td>{fe.minute}&apos;</td>
                  <td>
                    {fe.eventType === 'gol' && '⚽ Gol'}
                    {fe.eventType === 'tarjeta_amarilla' && '🟨 Tarjeta Amarilla'}
                    {fe.eventType === 'tarjeta_roja' && '🟥 Tarjeta Roja'}
                    {fe.eventType === 'sustitucion' && '🔄 Sustitución'}
                  </td>
                  <td>{fe.athleteName ?? 'Jugador'}</td>
                  <td>{fe.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Plantillas de juego de ambos equipos */}
      <section className="lineups-section">
        <h4>Alineaciones y Plantillas de Buena Fe</h4>
        <div className="lineups-grid">
          {data.participants.map((p) => (
            <div key={p.id} className="lineup-column">
              <h5>{p.name} ({p.side.toUpperCase()})</h5>
              <table className="print-table small">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Cód. Deportista</th>
                    <th>Nombre y Apellido</th>
                    <th>Firma</th>
                  </tr>
                </thead>
                <tbody>
                  {p.roster && p.roster.length > 0 ? (
                    p.roster.map((m, mIdx) => (
                      <tr key={mIdx}>
                        <td className="center">{m.jerseyNumber ?? '-'}</td>
                        <td className="code-cell">{m.code}</td>
                        <td>{m.name}</td>
                        <td className="signature-cell" aria-label="Espacio para firma"></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="empty-cell">Nómina disponible en mesa</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      {/* Observaciones del árbitro y vocal */}
      <section className="remarks-box">
        <h4>Informe del Árbitro y Novedades de la Vocalía:</h4>
        <div className="remarks-content">
          {data.result?.approvalNotes ? (
            <p>{data.result.approvalNotes}</p>
          ) : (
            <p className="handwritten-space">
              __________________________________________________________________________________________<br />
              __________________________________________________________________________________________<br />
              __________________________________________________________________________________________
            </p>
          )}
        </div>
      </section>

      {/* Firmas institucionales */}
      <footer className="institutional-signatures">
        <div className="signatures-grid">
          {data.signatories.map((sig, idx) => (
            <div key={idx} className="signature-block">
              <div className="signature-line"></div>
              <p className="signature-title">{sig.label}</p>
              <p className="signature-placeholder">Firma y Cédula</p>
            </div>
          ))}
        </div>
        <p className="footer-certificate">
          Certificado oficial emitido por el Sistema de la Liga Cantonal de Quero · Fecha de emisión:{' '}
          {new Date(data.documentMetadata.generatedAt).toLocaleString('es-EC')}
        </p>
      </footer>
    </article>
  );
}

function RosterDocument({
  data,
}: {
  data: RosterPrintData;
  onPrint: () => void;
}) {
  return (
    <article className="institutional-sheet">
      <header className="institutional-header">
        <div className="header-seal">
          <div className="seal-emblem">🛡️🏅</div>
        </div>
        <div className="header-text">
          <p className="republic-text">REPÚBLICA DEL ECUADOR</p>
          <h1 className="league-title">{data.documentMetadata.institution}</h1>
          <p className="affiliation-text">{data.documentMetadata.affiliation}</p>
          <p className="location-text">{data.documentMetadata.canton}</p>
          <h2 className="document-subtitle">{data.documentMetadata.title}</h2>
        </div>
      </header>

      <section className="document-meta-grid" aria-label="Detalle de inscripción">
        <div className="meta-item">
          <strong>Equipo / Participante:</strong> {data.participant.name}
        </div>
        <div className="meta-item">
          <strong>Club Deportivo:</strong> {data.participant.clubName}{' '}
          {data.participant.clubSector ? `(${data.participant.clubSector})` : ''}
        </div>
        <div className="meta-item">
          <strong>Campeonato:</strong> {data.championship.name}
        </div>
        <div className="meta-item">
          <strong>Deporte / Categoría:</strong> {data.championship.sport} ({data.championship.category})
        </div>
        <div className="meta-item">
          <strong>Temporada Oficial:</strong> {data.championship.season}
        </div>
        <div className="meta-item">
          <strong>Estado de Inscripción:</strong>{' '}
          <span className="status-tag">{data.participant.registrationStatus.toUpperCase()}</span>
        </div>
      </section>

      <section className="roster-table-section">
        <h4>Nómina Oficial de Deportistas Calificados y Habilitados</h4>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: '3rem' }}>N°</th>
              <th style={{ width: '4rem' }}>Dorsal</th>
              <th style={{ width: '8rem' }}>Cód. Registro</th>
              <th>Nombres y Apellidos Completos</th>
              <th style={{ width: '6rem' }}>Estado</th>
              <th style={{ width: '8rem' }}>Firma Deportista</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m, idx) => (
              <tr key={idx}>
                <td className="center">{idx + 1}</td>
                <td className="center"><strong>{m.jerseyNumber ?? '-'}</strong></td>
                <td className="code-cell">{m.code}</td>
                <td>{m.name}</td>
                <td className="center">{m.status.toUpperCase()}</td>
                <td className="signature-cell" aria-label="Espacio para firma"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="legal-commitment-box">
        <p>
          <strong>Declaración de Buena Fe:</strong> El Club Deportivo avala que los deportistas
          inscritos cumplen a cabalidad con los reglamentos, estatutos y límites de edad vigentes de la
          Liga Cantonal de Quero. Cualquier falsedad o adulteración será sancionada conforme al Código
          Disciplinario de la institución.
        </p>
      </section>

      <footer className="institutional-signatures">
        <div className="signatures-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {data.signatories.map((sig, idx) => (
            <div key={idx} className="signature-block">
              <div className="signature-line"></div>
              <p className="signature-title">{sig.label}</p>
              <p className="signature-placeholder">Firma y Sello Oficial</p>
            </div>
          ))}
        </div>
        <p className="footer-certificate">
          Documento oficial de la Liga Deportiva Cantonal de Quero · Generado el{' '}
          {new Date(data.documentMetadata.generatedAt).toLocaleString('es-EC')}
        </p>
      </footer>
    </article>
  );
}
