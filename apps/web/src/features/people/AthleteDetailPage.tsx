import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { SelectField, TextField } from './fields.tsx';
import {
  type Athlete,
  type AthleteTeam,
  CONSENT_LABELS,
  type Club,
  type Consent,
  type ConsentType,
  ELIGIBILITY_LABELS,
  type Eligibility,
  PERSON_STATUS_LABELS,
  type Page,
} from './types.ts';

type Pending =
  | { kind: 'eligibility'; eligibility: Eligibility }
  | { kind: 'status'; status: 'activo' | 'inactivo' }
  | { kind: 'revoke'; consent: Consent }
  | { kind: 'transfer'; club: Club };

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : '—';

export function AthleteDetailPage({
  athleteId,
  permissions,
}: {
  athleteId: string;
  permissions: readonly string[];
}) {
  const can = (permission: string) => permissions.includes(permission);
  const [athlete, reload] = useFetch<Athlete>(`/athletes/${athleteId}`);
  const [consents, reloadConsents] = useFetch<Consent[]>(
    `/athletes/${athleteId}/consents`,
  );
  const [teams, reloadTeams] = useFetch<AthleteTeam[]>(
    can('teams:read') ? `/athletes/${athleteId}/teams` : null,
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingConsent, setAddingConsent] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const refresh = () => {
    reload();
    reloadConsents();
    reloadTeams();
  };
  async function perform(operation: () => Promise<unknown>, success: string) {
    try {
      await operation();
      setNotice({ type: 'success', text: success });
      refresh();
    } catch (error) {
      setNotice({ type: 'error', text: describeError(error) });
    }
  }

  if (athlete.kind === 'loading')
    return <output className="loading">Cargando…</output>;
  if (athlete.kind === 'error') {
    return (
      <div className="state-error" role="alert">
        <p>{athlete.message}</p>
        <button type="button" onClick={reload}>
          Reintentar
        </button>{' '}
        <a href="#/deportistas">Volver al listado</a>
      </div>
    );
  }
  const a = athlete.data;
  const url = `/athletes/${athleteId}`;

  return (
    <section aria-labelledby="athlete-title" className="catalog">
      <p>
        <a href="#/deportistas">← Volver a deportistas</a>
      </p>
      <div className="catalog-header">
        <h2 id="athlete-title">
          {a.firstName} {a.lastName}
        </h2>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      <dl className="details">
        <dt>Código</dt>
        <dd>{a.code}</dd>
        <dt>Club</dt>
        <dd>{a.club.name}</dd>
        <dt>Estado</dt>
        <dd>{PERSON_STATUS_LABELS[a.status]}</dd>
        <dt>Habilitación</dt>
        <dd>{ELIGIBILITY_LABELS[a.eligibility]}</dd>
        <dt>Perfil público</dt>
        <dd>{a.publicProfile ? 'Publicado' : 'No publicado'}</dd>
      </dl>

      {a.full ? (
        <>
          <h3>Datos personales</h3>
          <p className="hint">
            Información reservada: solo la ven quienes tienen permiso de datos
            personales completos.
          </p>
          <dl className="details">
            <dt>Fecha de nacimiento</dt>
            <dd>
              {a.full.birthDate
                ? `${date(a.full.birthDate)} (${a.full.age} años)`
                : 'No registrada'}
            </dd>
            <dt>Documento</dt>
            <dd>
              {a.full.idNumber ? `${a.full.idType}: ${a.full.idNumber}` : '—'}
            </dd>
            <dt>Teléfono</dt>
            <dd>{a.full.phone ?? '—'}</dd>
            <dt>Tutor</dt>
            <dd>
              {a.full.guardianName
                ? `${a.full.guardianName} (${a.full.guardianRelation ?? 'sin parentesco'}) ${a.full.guardianPhone ?? ''}`
                : '—'}
            </dd>
          </dl>
        </>
      ) : (
        <p className="hint">
          Los datos personales (fecha de nacimiento, documento, teléfono y
          tutor) no están disponibles para su cuenta.
        </p>
      )}

      <div className="form-actions">
        {can('athletes:manage') && !editing && (
          <button type="button" onClick={() => setEditing(true)}>
            Editar datos
          </button>
        )}
        {can('athletes:manage') && (
          <button
            type="button"
            onClick={() =>
              setPending({
                kind: 'status',
                status: a.status === 'activo' ? 'inactivo' : 'activo',
              })
            }
          >
            {a.status === 'activo' ? 'Dar de baja' : 'Reactivar'}
          </button>
        )}
        {can('athletes:publish') && (
          <button
            type="button"
            onClick={() =>
              void perform(
                () =>
                  apiRequest(`${url}/publication`, {
                    method: 'PUT',
                    body: { published: !a.publicProfile },
                  }),
                a.publicProfile
                  ? 'Se retiró el perfil público.'
                  : 'Se publicó el perfil resumido.',
              )
            }
          >
            {a.publicProfile ? 'Retirar perfil público' : 'Publicar perfil'}
          </button>
        )}
      </div>

      {editing && (
        <EditAthleteForm
          athlete={a}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice({ type: 'success', text: 'Se guardaron los cambios.' });
            refresh();
          }}
        />
      )}

      {can('athletes:validate') && (
        <>
          <h3>Habilitación</h3>
          <div className="form-actions">
            {(['habilitado', 'inhabilitado', 'pendiente'] as const)
              .filter((e) => e !== a.eligibility)
              .map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() =>
                    setPending({ kind: 'eligibility', eligibility: e })
                  }
                >
                  Marcar como «{ELIGIBILITY_LABELS[e]}»
                </button>
              ))}
          </div>
        </>
      )}

      <h3>Consentimientos</h3>
      {consents.kind === 'ready' && consents.data.length === 0 && (
        <p className="empty">No hay consentimientos registrados.</p>
      )}
      {consents.kind === 'ready' && consents.data.length > 0 && (
        <table className="responsive-table">
          <caption className="visually-hidden">Consentimientos</caption>
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Otorgado por</th>
              <th scope="col">Vence</th>
              <th scope="col">Estado</th>
              {can('athletes:manage') && <th scope="col">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {consents.data.map((c) => (
              <tr key={c.id}>
                <td data-label="Tipo">{CONSENT_LABELS[c.type]}</td>
                <td data-label="Otorgado por">
                  {c.grantedByName} ({c.grantedByRelation})
                </td>
                <td data-label="Vence">{date(c.expiresAt)}</td>
                <td data-label="Estado">
                  {c.status === 'revocado'
                    ? `Revocado: ${c.revokeReason ?? ''}`
                    : c.active
                      ? 'Vigente'
                      : 'Vencido'}
                </td>
                {can('athletes:manage') && (
                  <td data-label="Acciones" className="row-actions">
                    {c.status === 'otorgado' && (
                      <button
                        type="button"
                        aria-label={`Revocar consentimiento de ${CONSENT_LABELS[c.type]}`}
                        onClick={() =>
                          setPending({ kind: 'revoke', consent: c })
                        }
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {can('athletes:manage') && !addingConsent && (
        <button type="button" onClick={() => setAddingConsent(true)}>
          Registrar consentimiento
        </button>
      )}
      {addingConsent && (
        <ConsentForm
          athleteId={athleteId}
          onCancel={() => setAddingConsent(false)}
          onSaved={() => {
            setAddingConsent(false);
            setNotice({
              type: 'success',
              text: 'Se registró el consentimiento.',
            });
            refresh();
          }}
        />
      )}

      {can('teams:read') && (
        <>
          <h3>Equipos</h3>
          {teams.kind === 'ready' && teams.data.length === 0 && (
            <p className="empty">Sin inscripciones en equipos.</p>
          )}
          {teams.kind === 'ready' && teams.data.length > 0 && (
            <ul>
              {teams.data.map((t) => (
                <li key={t.membershipId}>
                  {t.season.name}: {t.team.name} · {t.sport.name} ·{' '}
                  {t.category.name}
                  {t.status === 'baja' ? ' (baja)' : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {can('athletes:transfer') && (
        <TransferPanel
          current={a.club.id}
          onPick={(club) => setPending({ kind: 'transfer', club })}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={dialogTitle(pending)}
          description={dialogText(pending, a)}
          confirmLabel="Confirmar"
          reason="required"
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            const p = pending;
            setPending(null);
            if (p.kind === 'eligibility')
              await perform(
                () =>
                  apiRequest(`${url}/eligibility`, {
                    method: 'PATCH',
                    body: { eligibility: p.eligibility, reason },
                  }),
                'Se actualizó la habilitación.',
              );
            else if (p.kind === 'status')
              await perform(
                () =>
                  apiRequest(`${url}/status`, {
                    method: 'PATCH',
                    body: { status: p.status, reason },
                  }),
                'Se actualizó el estado.',
              );
            else if (p.kind === 'revoke')
              await perform(
                () =>
                  apiRequest(`${url}/consents/${p.consent.id}/revoke`, {
                    method: 'POST',
                    body: { reason },
                  }),
                'Se revocó el consentimiento.',
              );
            else
              await perform(
                () =>
                  apiRequest(`${url}/transfer`, {
                    method: 'POST',
                    body: { clubId: p.club.id, reason },
                  }),
                `Se transfirió al deportista a ${p.club.name}.`,
              );
          }}
        />
      )}
    </section>
  );
}

function dialogTitle(p: Pending): string {
  switch (p.kind) {
    case 'eligibility':
      return 'Cambiar habilitación';
    case 'status':
      return p.status === 'inactivo' ? 'Dar de baja' : 'Reactivar deportista';
    case 'revoke':
      return 'Revocar consentimiento';
    case 'transfer':
      return 'Transferir de club';
  }
}

function dialogText(p: Pending, a: Athlete): string {
  switch (p.kind) {
    case 'eligibility':
      return `${a.firstName} ${a.lastName} quedará como «${ELIGIBILITY_LABELS[p.eligibility]}».`;
    case 'status':
      return p.status === 'inactivo'
        ? 'Dejará de estar activo y se retirará su perfil público.'
        : 'Volverá a estar activo.';
    case 'revoke':
      return `Se revocará el consentimiento de «${CONSENT_LABELS[p.consent.type]}». Si es el de publicación del perfil, se retirará el perfil público.`;
    case 'transfer':
      return `Pasará al club ${p.club.name} y deberá validarse de nuevo. Solo es posible cuando no tiene inscripciones en la temporada vigente.`;
  }
}

function TransferPanel({
  current,
  onPick,
}: {
  current: string;
  onPick: (club: Club) => void;
}) {
  const [clubs] = useFetch<Page<Club>>('/clubs?pageSize=100');
  const [target, setTarget] = useState('');
  const options =
    clubs.kind === 'ready'
      ? clubs.data.items.filter(
          (c) => c.status === 'activo' && c.id !== current,
        )
      : [];
  return (
    <>
      <h3>Cambio de club</h3>
      <p className="hint">
        Se habilita al terminar la temporada: no debe tener inscripciones en la
        temporada vigente.
      </p>
      <div className="filters">
        <SelectField
          label="Club de destino"
          value={target}
          onChange={setTarget}
          placeholder="Seleccione…"
          options={options.map((c) => ({ value: c.id, label: c.name }))}
        />
        <button
          type="button"
          disabled={!target}
          onClick={() => {
            const club = options.find((c) => c.id === target);
            if (club) onPick(club);
          }}
        >
          Transferir
        </button>
      </div>
    </>
  );
}

function ConsentForm({
  athleteId,
  onSaved,
  onCancel,
}: {
  athleteId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ConsentType>('tratamiento_datos');
  const [by, setBy] = useState('');
  const [relation, setRelation] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!by.trim())
      found.grantedByName = 'Indique quién otorga el consentimiento.';
    if (!relation.trim())
      found.grantedByRelation = 'Indique «propio» o el parentesco del tutor.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await apiRequest(`/athletes/${athleteId}/consents`, {
        method: 'POST',
        body: {
          type,
          grantedByName: by.trim(),
          grantedByRelation: relation.trim(),
          ...(expiresOn && { expiresOn }),
        },
      });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors)
        setErrors(error.fieldErrors);
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="catalog-form"
      onSubmit={submit}
      noValidate
      aria-label="Nuevo consentimiento"
    >
      <h4>Registrar consentimiento</h4>
      <p className="hint">
        Si la persona es menor de edad lo otorga su tutor (indique el
        parentesco); si es mayor, ella misma (escriba «propio»).
      </p>
      <SelectField
        label="Tipo"
        value={type}
        onChange={(v) => setType(v as ConsentType)}
        options={(Object.keys(CONSENT_LABELS) as ConsentType[]).map((t) => ({
          value: t,
          label: CONSENT_LABELS[t],
        }))}
        disabled={submitting}
      />
      <TextField
        label="Otorgado por"
        required
        value={by}
        onChange={setBy}
        error={errors.grantedByName}
        maxLength={120}
        disabled={submitting}
      />
      <TextField
        label="Parentesco o «propio»"
        required
        value={relation}
        onChange={setRelation}
        error={errors.grantedByRelation}
        maxLength={40}
        disabled={submitting}
      />
      <TextField
        label="Vence el (opcional)"
        type="date"
        value={expiresOn}
        onChange={setExpiresOn}
        error={errors.expiresOn}
        disabled={submitting}
      />
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar consentimiento'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function EditAthleteForm({
  athlete,
  onSaved,
  onCancel,
}: {
  athlete: Athlete;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const full = athlete.full;
  const initial = {
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    birthDate: full?.birthDate ?? '',
    phone: full?.phone ?? '',
    guardianName: full?.guardianName ?? '',
    guardianRelation: full?.guardianRelation ?? '',
    guardianPhone: full?.guardianPhone ?? '',
  };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof typeof initial) => (value: string) =>
    setV((c) => ({ ...c, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    // Solo se envían los campos modificados; vaciar un dato opcional lo borra (null).
    const body: Record<string, unknown> = {};
    for (const key of Object.keys(initial) as (keyof typeof initial)[]) {
      if (v[key].trim() === initial[key]) continue;
      const optional = key !== 'firstName' && key !== 'lastName';
      body[key] = v[key].trim() === '' && optional ? null : v[key].trim();
    }
    setFormError(null);
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(`/athletes/${athlete.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors)
        setErrors(error.fieldErrors);
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="catalog-form"
      onSubmit={submit}
      noValidate
      aria-label="Editar deportista"
    >
      <h3>Editar datos</h3>
      <p className="hint">
        Cambiar el nombre o la fecha de nacimiento de un deportista habilitado
        lo devuelve a «Pendiente de validación».
      </p>
      <TextField
        label="Nombres"
        value={v.firstName}
        onChange={set('firstName')}
        error={errors.firstName}
        maxLength={80}
        disabled={submitting}
      />
      <TextField
        label="Apellidos"
        value={v.lastName}
        onChange={set('lastName')}
        error={errors.lastName}
        maxLength={80}
        disabled={submitting}
      />
      {full && (
        <>
          <TextField
            label="Fecha de nacimiento"
            type="date"
            value={v.birthDate}
            onChange={set('birthDate')}
            error={errors.birthDate}
            disabled={submitting}
          />
          <TextField
            label="Teléfono"
            type="tel"
            value={v.phone}
            onChange={set('phone')}
            error={errors.phone}
            maxLength={30}
            disabled={submitting}
          />
          <TextField
            label="Tutor"
            value={v.guardianName}
            onChange={set('guardianName')}
            error={errors.guardianName}
            maxLength={120}
            disabled={submitting}
          />
          <TextField
            label="Parentesco del tutor"
            value={v.guardianRelation}
            onChange={set('guardianRelation')}
            error={errors.guardianRelation}
            maxLength={40}
            disabled={submitting}
          />
          <TextField
            label="Teléfono del tutor"
            type="tel"
            value={v.guardianPhone}
            onChange={set('guardianPhone')}
            error={errors.guardianPhone}
            maxLength={30}
            disabled={submitting}
          />
        </>
      )}
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
