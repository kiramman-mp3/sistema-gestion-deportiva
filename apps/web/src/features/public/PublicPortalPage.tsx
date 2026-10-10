import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { InstitutionBrand } from '../../components/InstitutionBrand.tsx';
import { NavDrawer } from '../../components/NavDrawer.tsx';
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
  VerifyPage,
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
  | { page: 'liga' }
  | { page: 'verificar'; code?: string };

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
    case 'verificar':
      return { page: 'verificar', code: param };
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
      {/* Barra superior del portal según spec §6 y §13 */}
      <header className="portal-topbar">
        <div className="portal-topbar-inner">
          <div className="portal-topbar-brand">
            <button
              ref={menuButtonRef}
              type="button"
              className="portal-mobile-menu-btn"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menú"
            >
              <Icon name="menu" size={22} />
            </button>
            <InstitutionBrand href="#/portal" showSubtitle />
          </div>

          <nav className="portal-nav" aria-label="Secciones del portal">
            <ul className="portal-nav-list">
              {visible.map((n) => (
                <li key={n.page}>
                  <a
                    href={n.hash}
                    aria-current={n.page === current ? 'page' : undefined}
                    className={`portal-nav-link ${
                      n.page === current ? 'active' : ''
                    }`.trim()}
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Portal y acceso" className="portal-auth-nav">
            {onLoginClick ? (
              <button
                type="button"
                className="portal-login-button"
                onClick={onLoginClick}
              >
                <Icon name="lock" size={16} />
                <span>Acceso para dirigentes y árbitros</span>
              </button>
            ) : (
              <a href="#/" className="portal-login-button">
                <Icon name="lock" size={16} />
                <span>Acceso para dirigentes y árbitros</span>
              </a>
            )}
          </nav>
        </div>
      </header>

      {/* Menú móvil del portal */}
      <NavDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        triggerRef={menuButtonRef}
        title="Secciones del portal"
      >
        <nav aria-label="Secciones del portal" className="portal-drawer-nav">
          <ul className="portal-drawer-list">
            {visible.map((n) => (
              <li key={n.page}>
                <a
                  href={n.hash}
                  aria-current={n.page === current ? 'page' : undefined}
                  className={`portal-drawer-link ${
                    n.page === current ? 'active' : ''
                  }`.trim()}
                  onClick={() => setDrawerOpen(false)}
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </NavDrawer>

      <main className="portal-container" id="contenido">
        {route.page === 'inicio' && (
          <>
            <div className="portal-home-header">
              <h1 className="portal-title">
                {info?.name ?? 'Liga Deportiva Cantonal de Quero'}
              </h1>
              <p className="portal-description">
                {info?.affiliation ? `${info.affiliation}. ` : ''}
                Resultados oficiales, clasificaciones, calendarios y noticias de
                las competencias deportivas cantonales.
              </p>
            </div>
            <HomePage />
          </>
        )}
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
        {route.page === 'verificar' && <VerifyPage code={route.code} />}
      </main>

      <footer className="portal-footer">
        <div className="portal-footer-inner">
          <p className="footer-title">
            <strong>{info?.name ?? 'Liga Deportiva Cantonal de Quero'}</strong>
            {info?.canton ? ` · ${info.canton}` : ''}
          </p>
          {(info?.email || info?.phone) && (
            <p className="footer-contact">
              {info.phone}
              {info.phone && info.email ? ' · ' : ''}
              {info.email}
            </p>
          )}
          <p className="footer-links">
            <a href="#/portal/liga">Contacto y política de privacidad</a>
            {' · '}
            <a href="#/portal/verificar">Verificar un documento</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
