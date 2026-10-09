import { useState } from 'react';
import { apiRequest } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  Notice,
  type NoticeState,
  describeError,
} from '../../components/Notice.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { LoadState } from '../people/fields.tsx';
import { type IssuedDocument, KIND_LABELS } from './types.ts';

const dateFmt = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Carnés y certificados de un deportista: emitir, descargar y anular. */
export function IssuedDocumentsPanel({
  athleteId,
  canRevoke,
}: {
  athleteId: string;
  canRevoke: boolean;
}) {
  const [docs, reload] = useFetch<IssuedDocument[]>(
    `/athletes/${athleteId}/issued-documents`,
  );
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [revoking, setRevoking] = useState<IssuedDocument | null>(null);
  const [busy, setBusy] = useState(false);

  async function issue(kind: IssuedDocument['kind']) {
    setBusy(true);
    try {
      const created = await apiRequest<IssuedDocument>(
        `/athletes/${athleteId}/issued-documents`,
        { method: 'POST', body: { kind } },
      );
      setNotice({
        type: 'success',
        text: `Se emitió ${created.label} (versión ${created.version}).`,
      });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="issued-title">
      <h3 id="issued-title">Carnés y certificados</h3>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="form-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void issue('carne')}
        >
          Emitir carné
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void issue('certificado_inscripcion')}
        >
          Emitir certificado de inscripción
        </button>
      </div>
      <p className="hint">
        Reemitir un documento anula la versión anterior. Se emiten para la
        temporada activa y solo a deportistas habilitados con plantilla.
      </p>
      <LoadState state={docs} onRetry={reload} />
      {docs.kind === 'ready' && docs.data.length === 0 && (
        <p className="empty">Todavía no se emitió ningún documento.</p>
      )}
      {docs.kind === 'ready' && docs.data.length > 0 && (
        <table className="responsive-table">
          <caption className="visually-hidden">Documentos emitidos</caption>
          <thead>
            <tr>
              <th scope="col">Documento</th>
              <th scope="col">Temporada</th>
              <th scope="col">Emitido</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {docs.data.map((d) => (
              <tr key={d.id}>
                <td data-label="Documento">
                  <strong>{d.label}</strong> · {KIND_LABELS[d.kind]} (v
                  {d.version})
                  <div className="hint">Verificación: {d.verificationCode}</div>
                </td>
                <td data-label="Temporada">{d.season}</td>
                <td data-label="Emitido">
                  {dateFmt.format(new Date(d.issuedAt))}
                </td>
                <td data-label="Estado">
                  <span className={`badge ${d.valid ? 'badge-ok' : ''}`}>
                    {d.valid ? 'Vigente' : 'Anulado'}
                  </span>
                  {d.revokeReason && (
                    <div className="hint">{d.revokeReason}</div>
                  )}
                </td>
                <td data-label="Acciones" className="row-actions">
                  {d.valid && (
                    <a href={`/api/issued-documents/${d.id}/pdf`}>
                      Descargar PDF
                    </a>
                  )}
                  {d.valid && canRevoke && (
                    <button type="button" onClick={() => setRevoking(d)}>
                      Anular
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {revoking && (
        <ConfirmDialog
          title="Anular documento"
          description={`¿Anular ${revoking.label}? Dejará de ser válido al verificarlo en el portal.`}
          confirmLabel="Anular documento"
          reason="required"
          danger
          onCancel={() => setRevoking(null)}
          onConfirm={async (reason) => {
            const d = revoking;
            setRevoking(null);
            try {
              await apiRequest(`/issued-documents/${d.id}/revoke`, {
                method: 'POST',
                body: { reason },
              });
              setNotice({ type: 'success', text: `Se anuló ${d.label}.` });
              reload();
            } catch (err) {
              setNotice({ type: 'error', text: describeError(err) });
            }
          }}
        />
      )}
    </section>
  );
}
