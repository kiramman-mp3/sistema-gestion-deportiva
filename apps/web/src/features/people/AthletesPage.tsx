import { useId, useState } from 'react';
import { Notice, type NoticeState } from '../../components/Notice.tsx';
import { Modal } from '../../components/Modal.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { CreateAthleteForm } from './CreateAthleteForm.tsx';
import { LoadState, SelectField } from './fields.tsx';
import { OriginLinksForm } from './OriginLinks.tsx';
import {
  type Athlete,
  type AthleteLookup,
  ELIGIBILITY_LABELS,
  type Eligibility,
  PERSON_STATUS_LABELS,
  type Page,
} from './types.ts';

export function AthletesPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canCreate = permissions.includes('athletes:manage');
  const canSeeFull = permissions.includes('athletes:read_full');
  const searchId = useId();
  const [filters, setFilters] = useState({
    q: '',
    eligibility: '',
    page: 1,
  });
  const [searchText, setSearchText] = useState('');
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState<{
    athlete: Athlete;
    lookup: AthleteLookup | null;
  } | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: '20',
  });
  if (filters.q) params.set('q', filters.q);
  if (filters.eligibility) params.set('eligibility', filters.eligibility);
  const [list, reload] = useFetch<Page<Athlete>>(`/athletes?${params}`);
  const apply = (next: Partial<typeof filters>) =>
    setFilters((f) => ({ ...f, page: 1, ...next }));
  const filtersActive = Boolean(filters.q || filters.eligibility);

  return (
    <section aria-labelledby="athletes-title" className="catalog">
      <div className="catalog-header">
        <h1 id="athletes-title">Deportistas</h1>
        {canCreate && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Nuevo deportista
          </button>
        )}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {creating && (
        <Modal onClose={() => setCreating(false)} className="dialog-complex">
          <CreateAthleteForm
            canSeeFull={canSeeFull}
            onCancel={() => setCreating(false)}
            onCreated={(athlete, lookup) => {
              setCreating(false);
              setNotice({
                type: 'success',
                text: `Se registró a ${athlete.firstName} ${athlete.lastName} (${athlete.code}).`,
              });
              if (canSeeFull) setLinking({ athlete, lookup });
              reload();
            }}
          />
        </Modal>
      )}

      {linking && (
        <Modal onClose={() => setLinking(null)} className="dialog-complex">
          <OriginLinksForm
            athleteId={linking.athlete.id}
            athleteName={`${linking.athlete.firstName} ${linking.athlete.lastName}`}
            record={linking.lookup?.registry.record ?? null}
            registryConfigured={linking.lookup?.registry.configured ?? false}
            cancelLabel="Completar después"
            onCancel={() => setLinking(null)}
            onSaved={() => {
              setNotice({
                type: 'success',
                text: `Se guardaron los vínculos con Quero de ${linking.athlete.firstName} ${linking.athlete.lastName}.`,
              });
              setLinking(null);
            }}
          />
        </Modal>
      )}

      <search>
        <form
          className="filters"
          aria-label="Buscar deportistas"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: searchText.trim() });
          }}
        >
          <div className="field">
            <label htmlFor={searchId}>Buscar por nombre o código</label>
            <input
              id={searchId}
              type="search"
              maxLength={100}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <SelectField
            label="Habilitación"
            value={filters.eligibility}
            onChange={(eligibility) => apply({ eligibility })}
            placeholder="Todas"
            options={(Object.keys(ELIGIBILITY_LABELS) as Eligibility[]).map(
              (e) => ({ value: e, label: ELIGIBILITY_LABELS[e] }),
            )}
          />
          <button type="submit">Buscar</button>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                apply({ q: '', eligibility: '' });
              }}
            >
              Limpiar filtros
            </button>
          )}
        </form>
      </search>

      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty">
          {filtersActive
            ? 'No se encontraron deportistas con los filtros aplicados.'
            : 'Todavía no hay deportistas registrados.'}
        </p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          <table className="responsive-table">
            <caption className="visually-hidden">Deportistas</caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nombre</th>
                <th scope="col">Club</th>
                <th scope="col">Estado</th>
                <th scope="col">Habilitación</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Código">{a.code}</td>
                  <td data-label="Nombre">
                    {a.lastName}, {a.firstName}
                  </td>
                  <td data-label="Club">{a.club.name}</td>
                  <td data-label="Estado">{PERSON_STATUS_LABELS[a.status]}</td>
                  <td data-label="Habilitación">
                    {ELIGIBILITY_LABELS[a.eligibility]}
                  </td>
                  <td data-label="Acciones" className="row-actions">
                    <a
                      className="button-link"
                      href={`#/deportistas/${a.id}`}
                      aria-label={`Ver a ${a.firstName} ${a.lastName}`}
                    >
                      Ver ficha
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={(page) => setFilters((f) => ({ ...f, page }))}
          />
        </>
      )}
    </section>
  );
}
