import { type FormEvent, useState } from 'react';
import { ApiError, apiRequest } from '../../api/client.ts';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import {
  CheckboxField,
  LoadState,
  TextAreaField,
  TextField,
} from '../people/fields.tsx';
import type { Institution } from './types.ts';

type Draft = Record<
  | 'name'
  | 'shortName'
  | 'affiliation'
  | 'canton'
  | 'address'
  | 'email'
  | 'phone'
  | 'website'
  | 'about'
  | 'contactInfo'
  | 'privacyPolicy'
  | 'documentFooter'
  | 'presidentName'
  | 'secretaryName',
  string
>;

type Flags = Pick<
  Institution,
  | 'publicClubs'
  | 'publicAthletes'
  | 'publicNews'
  | 'publicResolutions'
  | 'allowSelfApproval'
>;

const toDraft = (i: Institution): Draft => ({
  name: i.name,
  shortName: i.shortName ?? '',
  affiliation: i.affiliation ?? '',
  canton: i.canton ?? '',
  address: i.address ?? '',
  email: i.email ?? '',
  phone: i.phone ?? '',
  website: i.website ?? '',
  about: i.about ?? '',
  contactInfo: i.contactInfo ?? '',
  privacyPolicy: i.privacyPolicy ?? '',
  documentFooter: i.documentFooter ?? '',
  presidentName: i.presidentName ?? '',
  secretaryName: i.secretaryName ?? '',
});

/** Datos institucionales, logotipo y parámetros de publicación del portal. */
export function InstitutionPage({
  permissions,
}: {
  permissions: readonly string[];
}) {
  const canManage = permissions.includes('institution:manage');
  const [state, reload] = useFetch<Institution>('/institution');
  const [notice, setNotice] = useState<NoticeState | null>(null);

  return (
    <section aria-labelledby="institution-title" className="catalog">
      <div className="catalog-header">
        <h1 id="institution-title">Configuración institucional</h1>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <LoadState state={state} onRetry={reload} />
      {state.kind === 'ready' && (
        <InstitutionForm
          institution={state.data}
          canManage={canManage}
          onNotice={setNotice}
          onChanged={reload}
        />
      )}
    </section>
  );
}

function InstitutionForm({
  institution,
  canManage,
  onNotice,
  onChanged,
}: {
  institution: Institution;
  canManage: boolean;
  onNotice: (notice: NoticeState) => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(institution));
  const [flags, setFlags] = useState<Flags>({
    publicClubs: institution.publicClubs,
    publicAthletes: institution.publicAthletes,
    publicNews: institution.publicNews,
    publicResolutions: institution.publicResolutions,
    allowSelfApproval: institution.allowSelfApproval,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!draft.name.trim()) {
      setErrors({ name: 'El nombre institucional es obligatorio.' });
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/institution', {
        method: 'PATCH',
        body: { ...draft, ...flags },
      });
      onNotice({ type: 'success', text: 'Se guardó la configuración.' });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors)
        setErrors(err.fieldErrors);
      setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting || !canManage;
  const flag = (key: keyof Flags) => (checked: boolean) =>
    setFlags((f) => ({ ...f, [key]: checked }));

  return (
    <form className="settings-form" onSubmit={submit} noValidate>
      {!canManage && (
        <p className="hint">Solo puede consultar esta configuración.</p>
      )}

      <fieldset>
        <legend>Identidad de la Liga</legend>
        <TextField
          label="Nombre institucional"
          value={draft.name}
          onChange={set('name')}
          required
          error={errors.name}
          maxLength={150}
          disabled={disabled}
        />
        <TextField
          label="Nombre corto"
          value={draft.shortName}
          onChange={set('shortName')}
          error={errors.shortName}
          maxLength={60}
          disabled={disabled}
        />
        <TextField
          label="Afiliación"
          value={draft.affiliation}
          onChange={set('affiliation')}
          error={errors.affiliation}
          maxLength={200}
          disabled={disabled}
        />
        <TextField
          label="Cantón y provincia"
          value={draft.canton}
          onChange={set('canton')}
          error={errors.canton}
          maxLength={200}
          disabled={disabled}
        />
        <InstitutionImageField
          kind="logo"
          label="Logotipo"
          present={institution.hasLogo}
          canManage={canManage}
          hint="Imagen JPG, PNG o WEBP de hasta 5 MB."
          onNotice={onNotice}
          onChanged={onChanged}
        />
        <InstitutionImageField
          kind="cover"
          label="Foto de portada del portal"
          present={institution.hasCover}
          canManage={canManage}
          hint="Foto horizontal de la Liga (por ejemplo 1600 × 900 px), JPG, PNG o WEBP de hasta 5 MB. Abre la portada del portal; si no hay, se usan las ilustraciones."
          onNotice={onNotice}
          onChanged={onChanged}
        />
      </fieldset>

      <fieldset>
        <legend>Contacto público</legend>
        <TextField
          label="Dirección"
          value={draft.address}
          onChange={set('address')}
          error={errors.address}
          maxLength={255}
          disabled={disabled}
        />
        <TextField
          label="Correo electrónico"
          type="email"
          value={draft.email}
          onChange={set('email')}
          error={errors.email}
          disabled={disabled}
        />
        <TextField
          label="Teléfono"
          value={draft.phone}
          onChange={set('phone')}
          error={errors.phone}
          maxLength={30}
          disabled={disabled}
        />
        <TextField
          label="Sitio web"
          value={draft.website}
          onChange={set('website')}
          error={errors.website}
          maxLength={200}
          hint="Debe empezar por http:// o https://"
          disabled={disabled}
        />
      </fieldset>

      <fieldset>
        <legend>Textos del portal</legend>
        <TextAreaField
          label="Quiénes somos"
          value={draft.about}
          onChange={set('about')}
          error={errors.about}
          maxLength={5000}
          disabled={disabled}
        />
        <TextAreaField
          label="Información de contacto"
          value={draft.contactInfo}
          onChange={set('contactInfo')}
          error={errors.contactInfo}
          maxLength={3000}
          hint="Horarios de atención y cómo presentar solicitudes."
          disabled={disabled}
        />
        <TextAreaField
          label="Política de privacidad"
          value={draft.privacyPolicy}
          onChange={set('privacyPolicy')}
          error={errors.privacyPolicy}
          maxLength={20000}
          rows={8}
          hint="Texto plano. Debe ser validado por la asesoría legal de la Liga."
          disabled={disabled}
        />
      </fieldset>

      <fieldset>
        <legend>Documentos oficiales</legend>
        <TextField
          label="Presidente de la Liga"
          value={draft.presidentName}
          onChange={set('presidentName')}
          error={errors.presidentName}
          maxLength={120}
          disabled={disabled}
        />
        <TextField
          label="Secretario/a de la Liga"
          value={draft.secretaryName}
          onChange={set('secretaryName')}
          error={errors.secretaryName}
          maxLength={120}
          disabled={disabled}
        />
        <TextField
          label="Pie de página de los documentos"
          value={draft.documentFooter}
          onChange={set('documentFooter')}
          error={errors.documentFooter}
          maxLength={300}
          disabled={disabled}
        />
      </fieldset>

      <fieldset>
        <legend>Publicación en el portal</legend>
        <CheckboxField
          label="Publicar la lista de clubes"
          checked={flags.publicClubs}
          onChange={flag('publicClubs')}
          disabled={disabled}
        />
        <CheckboxField
          label="Publicar perfiles de deportistas"
          checked={flags.publicAthletes}
          onChange={flag('publicAthletes')}
          hint="Solo se muestran los perfiles con consentimiento vigente."
          disabled={disabled}
        />
        <CheckboxField
          label="Publicar noticias y comunicados"
          checked={flags.publicNews}
          onChange={flag('publicNews')}
          disabled={disabled}
        />
        <CheckboxField
          label="Publicar resoluciones disciplinarias"
          checked={flags.publicResolutions}
          onChange={flag('publicResolutions')}
          hint="Apagado por defecto: solo se publican las resoluciones marcadas para publicación."
          disabled={disabled}
        />
      </fieldset>

      <fieldset>
        <legend>Aprobación de resultados</legend>
        <CheckboxField
          label="Permitir que quien registró un acta también la apruebe"
          checked={flags.allowSelfApproval}
          onChange={flag('allowSelfApproval')}
          hint="Desactivado por defecto: otra persona debe revisar el acta. Actívelo solo si la Liga cuenta con una única persona para ambas tareas."
          disabled={disabled}
        />
      </fieldset>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {canManage && (
        <div className="form-actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      )}
    </form>
  );
}

const IMAGE_TEXTS = {
  logo: {
    noun: 'logotipo',
    alt: 'Logotipo actual de la Liga',
    previewClass: 'logo-preview',
  },
  cover: {
    noun: 'foto de portada',
    alt: 'Foto de portada actual del portal',
    previewClass: 'cover-preview',
  },
} as const;

/** Subir, reemplazar o quitar una imagen institucional (logotipo o portada). */
function InstitutionImageField({
  kind,
  label,
  present,
  canManage,
  hint,
  onNotice,
  onChanged,
}: {
  kind: 'logo' | 'cover';
  label: string;
  present: boolean;
  canManage: boolean;
  hint: string;
  onNotice: (notice: NoticeState) => void;
  onChanged: () => void;
}) {
  const [version, setVersion] = useState(0);
  const { noun, alt, previewClass } = IMAGE_TEXTS[kind];
  const labelId = `${kind}-label`;
  const article = kind === 'logo' ? 'el' : 'la';

  async function change(file: File) {
    const body = new FormData();
    body.append('file', file);
    try {
      await apiRequest(`/institution/${kind}`, { method: 'PUT', body });
      setVersion((v) => v + 1);
      onNotice({
        type: 'success',
        text: `Se actualizó ${article} ${noun}.`,
      });
      onChanged();
    } catch (err) {
      onNotice({ type: 'error', text: describeError(err) });
    }
  }

  async function remove() {
    try {
      await apiRequest(`/institution/${kind}`, { method: 'DELETE' });
      onNotice({ type: 'success', text: `Se quitó ${article} ${noun}.` });
      onChanged();
    } catch (err) {
      onNotice({ type: 'error', text: describeError(err) });
    }
  }

  return (
    <div className="field">
      <span id={labelId} className="label-like">
        {label}
      </span>
      {present ? (
        <img
          className={previewClass}
          src={`/api/public/institution/${kind}?v=${version}`}
          alt={alt}
        />
      ) : (
        <p className="hint">Todavía no hay {noun}.</p>
      )}
      {canManage && (
        <div className="form-actions">
          <label className="button-like">
            {present ? `Reemplazar ${noun}` : `Subir ${noun}`}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="visually-hidden"
              aria-labelledby={labelId}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void change(file);
                e.target.value = '';
              }}
            />
          </label>
          {present && (
            <button type="button" onClick={() => void remove()}>
              Quitar {noun}
            </button>
          )}
        </div>
      )}
      <p className="hint">{hint}</p>
    </div>
  );
}
