import { type FormEvent, useState } from 'react';
import { ApiError, apiGet, apiRequest } from '../../api/client.ts';
import { describeError } from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { CheckboxField, SelectField, TextField } from './fields.tsx';
import type { Athlete, AthleteLookup, Club, Page } from './types.ts';

const EMPTY = {
  clubId: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  idType: 'cedula',
  idNumber: '',
  phone: '',
  guardianName: '',
  guardianRelation: '',
  guardianPhone: '',
};

/** Menor de edad hoy (hora local), según la fecha de nacimiento `AAAA-MM-DD`. */
export function isMinorOn(birthDate: string, today = new Date()): boolean {
  const [y, m, d] = birthDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  let age = today.getFullYear() - y;
  const month = today.getMonth() + 1;
  if (month < m || (month === m && today.getDate() < d)) age -= 1;
  return age < 18;
}

const ID_TYPE_OPTIONS = [
  { value: 'cedula', label: 'Cédula' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'otro', label: 'Otro' },
];

/**
 * Alta en dos pasos: primero se busca el documento (¿ya existe? ¿qué datos se pueden
 * precargar?) y luego se completa el resto. Sin datos personales completos no se busca
 * por documento: se registra solo con nombres y fecha.
 */
export function CreateAthleteForm({
  canSeeFull,
  onCreated,
  onCancel,
}: {
  canSeeFull: boolean;
  onCreated: (athlete: Athlete, lookup: AthleteLookup | null) => void;
  onCancel: () => void;
}) {
  const [clubs] = useFetch<Page<Club>>('/clubs?pageSize=100');
  const [v, setV] = useState(EMPTY);
  const [step, setStep] = useState<'search' | 'form'>(
    canSeeFull ? 'search' : 'form',
  );
  const [lookup, setLookup] = useState<AthleteLookup | null>(null);
  const [minor, setMinor] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setV((c) => ({ ...c, [key]: value }));
  const setDocument = (change: Partial<typeof EMPTY>) => {
    setV((c) => ({ ...c, ...change }));
    setLookup(null);
  };
  const setBirthDate = (birthDate: string) => {
    setV((c) => ({ ...c, birthDate }));
    if (/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) setMinor(isMinorOn(birthDate));
  };

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!v.idNumber.trim()) {
      setErrors({ idNumber: 'Ingrese el número de documento.' });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const query = new URLSearchParams({
        idType: v.idType,
        idNumber: v.idNumber.trim(),
      });
      const found = await apiGet<AthleteLookup>(`/athletes/lookup?${query}`);
      setLookup(found);
      if (found.existing?.kind === 'athlete') return;
      const source =
        found.existing?.kind === 'person'
          ? found.existing
          : found.registry.record;
      const birthDate = source?.birthDate ?? '';
      setV((c) => ({
        ...c,
        firstName: source?.firstName ?? '',
        lastName: source?.lastName ?? '',
        birthDate,
      }));
      setMinor(birthDate ? isMinorOn(birthDate) : false);
      setStep('form');
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors)
        setErrors(error.fieldErrors);
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(confirmDuplicate: boolean) {
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!v.clubId) found.clubId = 'Seleccione el club.';
    if (!v.firstName.trim()) found.firstName = 'Ingrese los nombres.';
    if (!v.lastName.trim()) found.lastName = 'Ingrese los apellidos.';
    if (canSeeFull && minor && !v.guardianName.trim())
      found.guardianName = 'Ingrese el nombre del tutor.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const body: Record<string, unknown> = {
      clubId: v.clubId,
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
    };
    if (v.birthDate) body.birthDate = v.birthDate;
    if (canSeeFull) {
      body.idType = v.idType;
      body.idNumber = v.idNumber.trim();
      const keys = minor
        ? ([
            'phone',
            'guardianName',
            'guardianRelation',
            'guardianPhone',
          ] as const)
        : (['phone'] as const);
      for (const key of keys) if (v[key].trim()) body[key] = v[key].trim();
    }
    if (confirmDuplicate) body.confirmDuplicate = true;

    setSubmitting(true);
    try {
      onCreated(
        await apiRequest<Athlete>('/athletes', { method: 'POST', body }),
        lookup,
      );
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors)
        setErrors(error.fieldErrors);
      setDuplicate(
        error instanceof ApiError &&
          error.status === 409 &&
          /mismo nombre y fecha de nacimiento/.test(error.message),
      );
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const errorNote = formError && (
    <p className="form-error" role="alert">
      {formError}
    </p>
  );

  if (step === 'search') {
    const existing =
      lookup?.existing?.kind === 'athlete' ? lookup.existing : null;
    return (
      <form
        className="catalog-form"
        onSubmit={search}
        noValidate
        aria-label="Buscar deportista"
      >
        <h3>Nuevo deportista</h3>
        <p className="hint">
          Busque primero por documento: si ya está registrado no se duplica y,
          si no, se cargan los datos disponibles.
        </p>
        <SelectField
          label="Tipo de documento"
          value={v.idType}
          onChange={(idType) => setDocument({ idType })}
          disabled={submitting}
          options={ID_TYPE_OPTIONS}
        />
        <TextField
          label="Número de documento"
          required
          value={v.idNumber}
          onChange={(idNumber) => setDocument({ idNumber })}
          error={errors.idNumber ?? errors.idType}
          maxLength={30}
          disabled={submitting}
        />
        {existing && (
          <output className="notice">
            {existing.athlete ? (
              <>
                Ya está registrado: {existing.athlete.firstName}{' '}
                {existing.athlete.lastName} ({existing.athlete.code}),{' '}
                {existing.club.name}.{' '}
                <a href={`#/deportistas/${existing.athlete.id}`}>Ver ficha</a>
              </>
            ) : (
              <>
                Ese documento ya pertenece a un deportista de{' '}
                {existing.club.name}. Para que juegue en su club, solicite un
                cambio de club a la Liga.
              </>
            )}
          </output>
        )}
        {errorNote}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Buscando…' : 'Buscar documento'}
          </button>
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  const knownPerson = lookup?.existing?.kind === 'person';
  const fromRegistry = !knownPerson && lookup?.registry.record != null;
  const source = knownPerson
    ? 'Persona ya registrada en el sistema: se reutilizan sus datos.'
    : fromRegistry
      ? 'Datos cargados del Registro Civil.'
      : 'Sin convenio con el Registro Civil: complete los datos a mano.';

  return (
    <form
      className="catalog-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
      noValidate
      aria-label="Nuevo deportista"
    >
      <h3>Nuevo deportista</h3>
      {canSeeFull && (
        <p className="hint">
          {ID_TYPE_OPTIONS.find((o) => o.value === v.idType)?.label}{' '}
          {v.idNumber.trim()} · {source}{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setStep('search');
              setLookup(null);
              setFormError(null);
            }}
            disabled={submitting}
          >
            Cambiar documento
          </button>
        </p>
      )}
      <SelectField
        label="Club"
        required
        value={v.clubId}
        onChange={set('clubId')}
        placeholder="Seleccione…"
        error={errors.clubId}
        disabled={submitting}
        options={
          clubs.kind === 'ready'
            ? clubs.data.items
                .filter((c) => c.status === 'activo')
                .map((c) => ({ value: c.id, label: c.name }))
            : []
        }
      />
      <TextField
        label="Nombres"
        required
        value={v.firstName}
        onChange={set('firstName')}
        error={errors.firstName}
        maxLength={80}
        disabled={submitting || knownPerson}
      />
      <TextField
        label="Apellidos"
        required
        value={v.lastName}
        onChange={set('lastName')}
        error={errors.lastName}
        maxLength={80}
        disabled={submitting || knownPerson}
      />
      <TextField
        label="Fecha de nacimiento"
        type="date"
        value={v.birthDate}
        onChange={setBirthDate}
        error={errors.birthDate}
        disabled={submitting || knownPerson}
        hint="Necesaria para validar la categoría y para habilitar al deportista."
      />
      {canSeeFull ? (
        <>
          <TextField
            label="Teléfono"
            type="tel"
            value={v.phone}
            onChange={set('phone')}
            error={errors.phone}
            maxLength={30}
            disabled={submitting}
          />
          <CheckboxField
            label="¿Es menor de edad?"
            checked={minor}
            onChange={setMinor}
            disabled={submitting}
            hint="Se marca sola según la fecha de nacimiento. Los menores necesitan un tutor."
          />
          {minor && (
            <>
              <TextField
                label="Nombre del tutor"
                required
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
        </>
      ) : (
        <p className="hint">
          Su cuenta no puede registrar documento, teléfono ni datos del tutor:
          quien tenga el permiso de datos personales completos los completará en
          la ficha.
        </p>
      )}
      {errorNote}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Registrando…' : 'Registrar deportista'}
        </button>
        {duplicate && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit(true)}
          >
            Es otra persona: registrar de todos modos
          </button>
        )}
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
