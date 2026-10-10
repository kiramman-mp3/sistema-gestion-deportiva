import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.ts';
import type { PublicInstitution } from '../features/public/types.ts';

let cachedPromise: Promise<PublicInstitution> | null = null;
let cachedData: PublicInstitution | null = null;

/**
 * Carga la información institucional compartida una sola vez vía `GET /api/public/institution`.
 */
export function fetchSharedInstitution(): Promise<PublicInstitution> {
  if (cachedData) return Promise.resolve(cachedData);
  if (!cachedPromise) {
    cachedPromise = apiGet<PublicInstitution>('/public/institution')
      .then((data) => {
        cachedData = data;
        return data;
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }
  return cachedPromise;
}

export function resetInstitutionCacheForTesting(): void {
  cachedPromise = null;
  cachedData = null;
}

export function useSharedInstitution(): {
  institution: PublicInstitution | null;
  loading: boolean;
} {
  const [institution, setInstitution] = useState<PublicInstitution | null>(
    cachedData,
  );
  const [loading, setLoading] = useState<boolean>(!cachedData);

  useEffect(() => {
    if (cachedData) {
      return;
    }
    let isMounted = true;
    fetchSharedInstitution()
      .then((data) => {
        if (isMounted) {
          setInstitution(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return { institution, loading };
}

export interface InstitutionBrandProps {
  href?: string;
  short?: boolean;
  showSubtitle?: boolean;
  className?: string;
}

/**
 * Marca institucional: muestra el logotipo oficial real solo si `hasLogo: true`.
 * Si no hay logotipo, solo muestra el nombre institucional. Nunca dibuja ni sustituye un escudo.
 * No utiliza rol de encabezado (spec §1, §6, §7).
 */
export function InstitutionBrand({
  href,
  short = false,
  showSubtitle = false,
  className = '',
}: InstitutionBrandProps) {
  const { institution } = useSharedInstitution();

  const name =
    short && institution?.shortName
      ? institution.shortName
      : (institution?.name ?? 'Liga Cantonal de Quero');

  const content = (
    <div className={`institution-brand ${className}`.trim()}>
      {institution?.hasLogo ? (
        <img
          src="/api/public/institution/logo"
          alt={`Logotipo de ${institution.name}`}
          className="institution-logo"
        />
      ) : null}
      <div className="institution-brand-text">
        <span className="institution-name">{name}</span>
        {showSubtitle ? (
          <span className="institution-subtitle">
            {institution?.affiliation ?? 'Campeonatos y resultados oficiales'}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="institution-brand-link">
        {content}
      </a>
    );
  }

  return content;
}
