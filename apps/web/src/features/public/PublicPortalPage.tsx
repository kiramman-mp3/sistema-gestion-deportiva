import { useEffect, useState } from 'react';
import { useFetch } from '../../hooks/useFetch.ts';
import { CompetitionsView } from './CompetitionsView.tsx';
import {
  AboutPage,
  CalendarPage,
  ClubsPage,
  HomePage,
  MatchPage,
  NewsArticlePage,
  NewsListPage,
  ResolutionsPage,
} from './PortalPages.tsx';
import type { PublicInstitution } from './types.ts';

interface PublicPortalPageProps {
  onLoginClick?: () => void;
  onOpenPrintDocument?: (kind: 'acta' | 'nomina', id: string) => void;
}

type PortalRoute =
  | { page: 'inicio' }
  | { page: 'competencias' }
  | { page: 'calendario' }
  | { page: 'partido'; id: string }
  | { page: 'noticias' }
  | { page: 'noticia'; slug: string }
  | { page: 'clubes' }
  | { page: 'resoluciones' }
  | { page: 'liga' };

/** `#/portal`, `#/portal/noticias/<slug>`, `#/portal/partido/<id>`… */
export function parsePortalRoute(hash: string): PortalRoute {
  const [, , section, param] = hash.split('/');
  switch (section) {
    case 'competencias':
      return { page: 'competencias' };
    case 'calendario':
      return { page: 'calendario' };
    case 'partido':
      return param ? { page: 'partido', id: param } : { page: 'calendario' };
    case 'noticias':
      return param ? { page: 'noticia', slug: param } : { page: 'noticias' };
    case 'clubes':
      return { page: 'clubes' };
    case 'resoluciones':
      return { page: 'resoluciones' };
    case 'liga':
      return { page: 'liga' };
    default:
      return { page: 'inicio' };
  }
}

const NAV: { page: PortalRoute['page']; hash: string; label: string }[] = [
  { page: 'inicio', hash: '#/portal', label: 'Inicio' },
  {
    page: 'competencias',
    hash: '#/portal/competencias',
    label: 'Competencias',
  },
  { page: 'calendario', hash: '#/portal/calendario', label: 'Calendario' },
  { page: 'noticias', hash: '#/portal/noticias', label: 'Noticias' },
  { page: 'clubes', hash: '#/portal/clubes', label: 'Clubes' },
  {
    page: 'resoluciones',
    hash: '#/portal/resoluciones',
    label: 'Resoluciones',
  },
  { page: 'liga', hash: '#/portal/liga', label: 'La Liga' },
];

/** Portal público: inicio, competencias, calendario, noticias, clubes, resoluciones e información de la Liga. */
export function PublicPortalPage({
  onLoginClick,
  onOpenPrintDocument,
}: PublicPortalPageProps) {
  const [route, setRoute] = useState(() =>
    parsePortalRoute(window.location.hash),
  );
  const [institution] = useFetch<PublicInstitution>('/public/institution');

  useEffect(() => {
    const onChange = () => {
      setRoute(parsePortalRoute(window.location.hash));
      window.scrollTo?.({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const info = institution.kind === 'ready' ? institution.data : null;
  const visible = NAV.filter((n) => {
    if (!info) return true;
    if (n.page === 'noticias') return info.publication.news;
    if (n.page === 'clubes') return info.publication.clubs;
    if (n.page === 'resoluciones') return info.publication.resolutions;
    return true;
  });
  const current =
    route.page === 'partido'
      ? 'calendario'
      : route.page === 'noticia'
        ? 'noticias'
        : route.page;

  const openPrint = (kind: 'acta' | 'nomina', id: string) => {
    if (onOpenPrintDocument) onOpenPrintDocument(kind, id);
    else window.location.hash = `#/imprimir/${kind}/${id}`;
  };

  return (
    <div className="public-portal">
      <header className="portal-hero">
        <div className="hero-content">
          {info?.hasLogo && (
            <img
              className="hero-logo"
              src="/api/public/institution/logo"
              alt={`Logotipo de ${info.name}`}
            />
          )}
          <div className="hero-badge">Portal oficial</div>
          <h2>{info?.name ?? 'Liga Deportiva Cantonal de Quero'}</h2>
          <p className="hero-description">
            {info?.affiliation ? `${info.affiliation}. ` : ''}
            Resultados oficiales, clasificaciones, calendarios y noticias de las
            competencias deportivas cantonales.
          </p>
          {onLoginClick && (
            <div className="hero-actions">
              <button
                type="button"
                onClick={onLoginClick}
                className="secondary-button"
              >
                🔐 Acceso para dirigentes y jueces
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className="portal-nav" aria-label="Secciones del portal">
        <ul>
          {visible.map((n) => (
            <li key={n.page}>
              <a
                href={n.hash}
                aria-current={n.page === current ? 'page' : undefined}
              >
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {route.page === 'inicio' && <HomePage />}
      {route.page === 'competencias' && (
        <CompetitionsView onOpenPrintDocument={onOpenPrintDocument} />
      )}
      {route.page === 'calendario' && <CalendarPage />}
      {route.page === 'partido' && (
        <MatchPage eventId={route.id} onOpenPrint={openPrint} />
      )}
      {route.page === 'noticias' && <NewsListPage />}
      {route.page === 'noticia' && <NewsArticlePage slug={route.slug} />}
      {route.page === 'clubes' && <ClubsPage />}
      {route.page === 'resoluciones' && <ResolutionsPage />}
      {route.page === 'liga' && info && <AboutPage institution={info} />}

      <footer className="portal-footer">
        <p>
          <strong>{info?.name ?? 'Liga Deportiva Cantonal de Quero'}</strong>
          {info?.canton ? ` · ${info.canton}` : ''}
        </p>
        {(info?.email || info?.phone) && (
          <p>
            {info.phone}
            {info.phone && info.email ? ' · ' : ''}
            {info.email}
          </p>
        )}
        <p>
          <a href="#/portal/liga">Contacto y política de privacidad</a>
        </p>
      </footer>
    </div>
  );
}
