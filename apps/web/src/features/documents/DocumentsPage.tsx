import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch.ts';
import { LoadState, SelectField } from '../people/fields.tsx';
import type { Page } from './types.ts';

interface ChampionshipOption {
  id: string;
  name: string;
}

interface RegistrationOption {
  id: string;
  status: string;
  participant: {
    team?: { team: { name: string } } | null;
    individual?: {
      athlete: { person: { firstName: string; lastName: string } };
    } | null;
  };
}

const participantLabel = (r: RegistrationOption) =>
  r.participant.team?.team.name ??
  (r.participant.individual
    ? `${r.participant.individual.athlete.person.firstName} ${r.participant.individual.athlete.person.lastName}`
    : r.id);

function DownloadLinks({ base }: { base: string }) {
  const sep = base.includes('?') ? '&' : '?';
  return (
    <span className="row-actions">
      <a href={`${base}${sep}format=pdf`}>PDF</a>
      <a href={`${base}${sep}format=csv`}>CSV (Excel)</a>
    </span>
  );
}

/** Reportes y documentos oficiales en PDF o CSV. */
export function DocumentsPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canSanctions = permissions.includes('sanctions:read');
  const [championshipId, setChampionshipId] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [sanctionStatus, setSanctionStatus] = useState('');
  const [champs, reloadChamps] = useFetch<Page<ChampionshipOption>>(
    '/championships?pageSize=100',
  );
  const [regs] = useFetch<RegistrationOption[]>(
    championshipId ? `/championships/${championshipId}/registrations` : null,
  );

  return (
    <section aria-labelledby="documents-title" className="catalog">
      <div className="catalog-header">
        <h1 id="documents-title">Reportes y documentos</h1>
      </div>
      <p className="hint">
        Cada documento lleva la fecha de generación y un código, y queda
        registrado en la auditoría quién lo generó. Los carnés y certificados se
        emiten desde la ficha de cada deportista; los carnés de un equipo, desde
        su ficha.
      </p>

      <LoadState state={champs} onRetry={reloadChamps} />
      {champs.kind === 'ready' && (
        <fieldset className="settings-form">
          <legend>Campeonato</legend>
          <SelectField
            label="Campeonato"
            value={championshipId}
            onChange={(v) => {
              setChampionshipId(v);
              setRegistrationId('');
            }}
            placeholder="Seleccione un campeonato"
            options={champs.data.items.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
          {championshipId && (
            <ul className="plain-list">
              <li>
                Listado de equipos inscritos:{' '}
                <DownloadLinks
                  base={`/api/reports/championships/${championshipId}/teams`}
                />
              </li>
              <li>
                Tabla de posiciones:{' '}
                <DownloadLinks
                  base={`/api/reports/championships/${championshipId}/standings`}
                />
              </li>
              <li>
                Calendario de encuentros:{' '}
                <DownloadLinks
                  base={`/api/reports/championships/${championshipId}/fixtures`}
                />
              </li>
            </ul>
          )}
          {championshipId && regs.kind === 'ready' && (
            <>
              <SelectField
                label="Nómina de buena fe de"
                value={registrationId}
                onChange={setRegistrationId}
                placeholder="Seleccione un participante inscrito"
                options={regs.data.map((r) => ({
                  value: r.id,
                  label: participantLabel(r),
                }))}
              />
              {registrationId && (
                <p>
                  Nómina:{' '}
                  <DownloadLinks
                    base={`/api/reports/registrations/${registrationId}/roster`}
                  />
                </p>
              )}
            </>
          )}
        </fieldset>
      )}

      {canSanctions && (
        <fieldset className="settings-form">
          <legend>Informe de sanciones</legend>
          <SelectField
            label="Estado"
            value={sanctionStatus}
            onChange={setSanctionStatus}
            placeholder="Todas"
            options={[
              { value: 'vigente', label: 'Vigentes' },
              { value: 'cumplida', label: 'Cumplidas' },
              { value: 'anulada', label: 'Anuladas' },
            ]}
          />
          <p>
            Informe:{' '}
            <DownloadLinks
              base={`/api/reports/sanctions${sanctionStatus ? `?status=${sanctionStatus}` : ''}`}
            />
          </p>
        </fieldset>
      )}
    </section>
  );
}
