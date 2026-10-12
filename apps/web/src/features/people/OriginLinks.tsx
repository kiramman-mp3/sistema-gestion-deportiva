import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import { describeError } from '../../components/Notice.tsx';
import { Modal } from '../../components/Modal.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { CheckboxField, LoadState, TextField } from './fields.tsx';
import {
  type OriginLink,
  QUERO_LINK_LABELS,
  type QueroLinkKind,
  type RegistryRecord,
  type RegistryRelative,
} from './types.ts';

const KINDS = Object.keys(QUERO_LINK_LABELS) as QueroLinkKind[];

interface Draft {
  checked: boolean;
  relatedName: string;
  relatedIdNumber: string;
  birthPlace: string;
}

const fromRelative = (r: RegistryRelative | null): Draft => ({
  checked: false,
  relatedName: r?.name ?? '',
  relatedIdNumber: r?.idNumber ?? '',
  birthPlace: r?.birthPlace ?? '',
});

/** Borradores iniciales: lo ya guardado o, si no hay, lo que entregue el Registro Civil. */
function initialDrafts(
  saved: OriginLink[],
  record: RegistryRecord | null,
): Record<QueroLinkKind, Draft> {
  const drafts: Record<QueroLinkKind, Draft> = {
    nacimiento: {
      ...fromRelative(null),
      birthPlace: record?.birthPlace ?? '',
    },
    matrimonio: fromRelative(record?.spouse ?? null),
    padre: fromRelative(record?.father ?? null),
    madre: fromRelative(record?.mother ?? null),
  };
  for (const l of saved) {
    drafts[l.kind] = {
      checked: true,
      relatedName: l.relatedName ?? '',
      relatedIdNumber: l.relatedIdNumber ?? '',
      birthPlace: l.birthPlace ?? '',
    };
  }
  return drafts;
}

/** Formulario de vínculos con Quero: reemplaza todos los vínculos del deportista. */
export function OriginLinksForm({
  athleteId,
  athleteName,
  saved = [],
  record = null,
  registryConfigured = false,
  onSaved,
  onCancel,
  cancelLabel = 'Cancelar',
}: {
  athleteId: string;
  athleteName: string;
  saved?: OriginLink[];
  record?: RegistryRecord | null;
  registryConfigured?: boolean;
  onSaved: (links: OriginLink[]) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [drafts, setDrafts] = useState(() => initialDrafts(saved, record));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const update = (kind: QueroLinkKind, change: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [kind]: { ...d[kind], ...change } }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    for (const kind of KINDS) {
      const d = drafts[kind];
      if (d.checked && kind !== 'nacimiento' && !d.relatedName.trim())
        found[kind] = 'Indique el nombre de la persona de Quero.';
    }
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const links = KINDS.filter((k) => drafts[k].checked).map((kind) => {
      const d = drafts[kind];
      return kind === 'nacimiento'
        ? { kind, birthPlace: d.birthPlace }
        : {
            kind,
            relatedName: d.relatedName,
            relatedIdNumber: d.relatedIdNumber,
            birthPlace: d.birthPlace,
          };
    });
    setSubmitting(true);
    try {
      onSaved(
        await apiRequest<OriginLink[]>(`/athletes/${athleteId}/origin-links`, {
          method: 'PUT',
          body: { links },
        }),
      );
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
      aria-label="Vínculos con Quero"
    >
      <h3>Vínculos con Quero</h3>
      <p className="hint">
        {athleteName} puede jugar si nació en Quero, si está casado/a con una
        persona de Quero o si su padre o madre es de Quero. Marque todos los que
        apliquen.
      </p>
      {!registryConfigured && (
        <p className="hint">
          Aún no hay convenio con el Registro Civil: ingrese los datos a mano.
          Quedan como declarados hasta que la comisión revise los documentos.
        </p>
      )}
      {KINDS.map((kind) => {
        const d = drafts[kind];
        return (
          <fieldset key={kind} className="origin-link">
            <CheckboxField
              label={QUERO_LINK_LABELS[kind]}
              checked={d.checked}
              onChange={(checked) => update(kind, { checked })}
              disabled={submitting}
            />
            {d.checked && kind !== 'nacimiento' && (
              <>
                <TextField
                  label="Nombre completo de la persona de Quero"
                  required
                  value={d.relatedName}
                  onChange={(relatedName) => update(kind, { relatedName })}
                  error={errors[kind]}
                  maxLength={160}
                  disabled={submitting}
                />
                <TextField
                  label="Cédula de la persona de Quero"
                  value={d.relatedIdNumber}
                  onChange={(relatedIdNumber) =>
                    update(kind, { relatedIdNumber })
                  }
                  maxLength={30}
                  disabled={submitting}
                />
              </>
            )}
            {d.checked && (
              <TextField
                label={
                  kind === 'nacimiento'
                    ? 'Lugar de nacimiento (parroquia o cantón)'
                    : 'Lugar de nacimiento de esa persona'
                }
                value={d.birthPlace}
                onChange={(birthPlace) => update(kind, { birthPlace })}
                maxLength={120}
                disabled={submitting}
              />
            )}
          </fieldset>
        );
      })}
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar vínculos'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          {cancelLabel}
        </button>
      </div>
    </form>
  );
}

/** Sección de la ficha: muestra los vínculos y permite editarlos. */
export function OriginLinksPanel({
  athleteId,
  athleteName,
  canEdit,
}: {
  athleteId: string;
  athleteName: string;
  canEdit: boolean;
}) {
  const [links, reload] = useFetch<OriginLink[]>(
    `/athletes/${athleteId}/origin-links`,
  );
  const [editing, setEditing] = useState(false);
  return (
    <>
      <h2>Vínculos con Quero</h2>
      <LoadState state={links} onRetry={reload} />
      {links.kind === 'ready' && links.data.length === 0 && (
        <p className="empty">Sin vínculos registrados.</p>
      )}
      {links.kind === 'ready' && links.data.length > 0 && (
        <ul>
          {links.data.map((l) => (
            <li key={l.id}>
              <strong>{QUERO_LINK_LABELS[l.kind]}</strong>
              {[
                l.relatedName,
                l.relatedIdNumber && `C.I. ${l.relatedIdNumber}`,
                l.birthPlace && `nacido/a en ${l.birthPlace}`,
              ]
                .filter(Boolean)
                .map((t) => ` · ${t}`)
                .join('')}
              {l.source === 'manual' && ' (declarado)'}
            </li>
          ))}
        </ul>
      )}
      {canEdit && links.kind === 'ready' && (
        <p>
          <button type="button" onClick={() => setEditing(true)}>
            Editar vínculos
          </button>
        </p>
      )}
      {editing && links.kind === 'ready' && (
        <Modal onClose={() => setEditing(false)} className="dialog-complex">
          <OriginLinksForm
            athleteId={athleteId}
            athleteName={athleteName}
            saved={links.data}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
