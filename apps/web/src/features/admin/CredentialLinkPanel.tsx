import { useState } from 'react';
import { type CredentialLink, formatDateTime } from './types.ts';

/** Dirección que el titular debe abrir. El token va en el fragmento (#): no viaja al servidor. */
export function credentialUrl(link: CredentialLink): string {
  const route = link.kind === 'activacion' ? 'activar' : 'restablecer';
  return `${window.location.origin}/#/${route}/${link.token}`;
}

/**
 * Muestra UNA SOLA VEZ un enlace de activación o restablecimiento. No se guarda en
 * ningún almacenamiento ni se vuelve a mostrar: al cerrar el panel se descarta.
 */
export function CredentialLinkPanel({
  link,
  userLabel,
  onClose,
}: {
  link: CredentialLink;
  userLabel: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const url = credentialUrl(link);
  const title =
    link.kind === 'activacion'
      ? 'Enlace de activación'
      : 'Enlace de restablecimiento';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  }

  return (
    <section className="token-box" aria-labelledby="link-title">
      <h3 id="link-title">
        {title} para {userLabel}
      </h3>
      <p>
        Este enlace <strong>se muestra una sola vez</strong>. Entréguelo al
        titular por un canal de confianza (en persona o por un medio privado):
        no se envía por correo. Es de un solo uso y vence el{' '}
        {formatDateTime(link.expiresAt)}.
      </p>
      <div className="field">
        <label htmlFor="credential-url">Enlace</label>
        <input
          id="credential-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      <div className="form-actions">
        <button type="button" onClick={() => void copy()}>
          Copiar enlace
        </button>
        <button type="button" className="primary" onClick={onClose}>
          Ya lo entregué, cerrar
        </button>
      </div>
      <output>
        {copied === 'ok' && 'Enlace copiado.'}
        {copied === 'fail' &&
          'No se pudo copiar automáticamente: selecciónelo y cópielo manualmente.'}
      </output>
    </section>
  );
}
