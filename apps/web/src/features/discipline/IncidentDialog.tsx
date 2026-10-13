import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { Modal } from '../../components/Modal.tsx';
import { describeError } from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { SelectField, TextAreaField } from '../people/fields.tsx';
import type { Athlete } from '../people/types.ts';
import { INCIDENT_TYPE_LABELS, type Page } from './types.ts';

/** Reporte de una incidencia de un partido (árbitro designado o comisión). */
export function IncidentDialog({
  eventId,
  title,
  clubs,
  canListAthletes,
  onClose,
  onReported,
}: {
  eventId: string;
  title: string;
  /** Clubes que juegan el partido. */
  clubs: { id: string; name: string }[];
  /** Si el usuario puede buscar deportistas de los clubes (`athletes:read`). */
  canListAthletes: boolean;
  onClose: () => void;
  onReported: () => void;
}) {
  const [type, setType] = useState('conducta_antideportiva');
  const [clubId, setClubId] = useState('');
  const [athleteId, setAthleteId] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [athletes] = useFetch<Page<Athlete>>(
    canListAthletes && clubId
      ? `/athletes?clubId=${clubId}&pageSize=100`
      : null,
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (description.trim().length < 5) {
      setErrors({ description: 'Describa lo ocurrido (mínimo 5 caracteres).' });
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await apiRequest(`/events/${eventId}/incidents`, {
        method: 'POST',
        body: {
          type,
          description: description.trim(),
          clubId: clubId || null,
          athleteId: athleteId || null,
        },
      });
      onReported();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors)
        setErrors(err.fieldErrors);
      setFormError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={busy}>
      <div className="dialog-content">
        <h4>Reportar incidencia: {title}</h4>
        <form onSubmit={submit} noValidate>
          <SelectField
            label="Tipo de incidencia"
            value={type}
            onChange={setType}
            options={Object.entries(INCIDENT_TYPE_LABELS).map(
              ([value, label]) => ({ value, label }),
            )}
            disabled={busy}
          />
          <SelectField
            label="Club involucrado"
            value={clubId}
            onChange={(v) => {
              setClubId(v);
              setAthleteId('');
            }}
            placeholder="Ninguno en particular"
            options={clubs.map((c) => ({ value: c.id, label: c.name }))}
            disabled={busy}
          />
          {canListAthletes && clubId && athletes.kind === 'ready' && (
            <SelectField
              label="Deportista involucrado"
              value={athleteId}
              onChange={setAthleteId}
              placeholder="Ninguno en particular"
              options={athletes.data.items.map((a) => ({
                value: a.id,
                label: `${a.firstName} ${a.lastName} (${a.code})`,
              }))}
              disabled={busy}
            />
          )}
          <TextAreaField
            label="Descripción"
            value={description}
            onChange={setDescription}
            required
            error={errors.description}
            maxLength={2000}
            rows={5}
            hint="Relate los hechos con objetividad. La descripción es de uso interno de la Liga."
            disabled={busy}
          />
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Enviando…' : 'Reportar incidencia'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
