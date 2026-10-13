import { useState } from 'react';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import { Pagination } from '../../components/Pagination.tsx';
import { Confetti, SportArt, sportKey } from '../../components/SportArt.tsx';
import {
  groupBySport,
  HomeHero,
  matchState,
  pickStandingsChampionship,
  sides,
  SportsShowcase,
  StandingsSnapshot,
} from './HomeSections.tsx';
import { LoadState, SelectField, TextField } from '../people/fields.tsx';
import type {
  PublicAnnouncement,
  PublicAnnouncementSummary,
  PublicChampionshipsResponse,
  PublicClub,
  PublicEventDetail,
  PublicEventSummary,
  PublicHome,
  PublicInstitution,
  PublicPage,
  PublicResolution,
  PublicVerification,
  ScoresheetPrintData,
} from './types.ts';

const dateTime = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateOnly = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' });
const day = (iso: string) =>
  dateOnly.format(new Date(iso.slice(0, 10) + 'T12:00:00'));

const STATUS_LABELS: Record<string, string> = {
  programado: 'Programado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  suspendido: 'Suspendido',
  postergado: 'Postergado',
  cancelado: 'Cancelado',
};

/** Texto plano: cada línea en blanco separa un párrafo. Nunca se interpreta como HTML. */
export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="plain-text">
            {p}
          </p>
        ))}
    </>
  );
}

function CopyLink({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}${hash}`;
        void navigator.clipboard
          ?.writeText(url)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
    >
      {copied ? 'Enlace copiado' : 'Copiar enlace'}
    </button>
  );
}

// ───────────────────── Partidos ─────────────────────

// ───────────────────── Encabezado de sección ─────────────────────

/**
 * Banda de color con el título de la página. El tono reutiliza los colores de deporte
 * (clase `sport-*`) para que cada sección del portal tenga el suyo.
 */
export function PageBanner({
  id,
  title,
  lead,
  icon,
  tone,
}: {
  id?: string;
  title: string;
  lead?: string | null;
  icon: IconName;
  tone: string;
}) {
  return (
    <div className={`page-banner sport-${tone}`}>
      <Icon name={icon} size={160} className="page-banner-icon" />
      <h1 id={id} className="page-banner-title">
        {title}
      </h1>
      {lead && <p className="page-banner-lead">{lead}</p>}
    </div>
  );
}

// ───────────────────── Inicio ─────────────────────

export function NewsCard({
  item,
  headingLevel = 'h2',
}: {
  item: PublicAnnouncementSummary;
  headingLevel?: 'h2' | 'h3';
}) {
  const TitleTag = headingLevel;
  return (
    <article className="news-card">
      {item.cover ? (
        <img
          src={`/api/public/media/${item.cover.id}`}
          alt={item.cover.altText}
        />
      ) : (
        <span className="news-card-placeholder" aria-hidden="true">
          <Confetti />
          <SportArt sport={null} size={72} />
        </span>
      )}
      <div className="news-body">
        <span className="sport-tag">
          {item.kind === 'comunicado' ? 'Comunicado' : 'Noticia'} ·{' '}
          {dateOnly.format(new Date(item.publishedAt))}
        </span>
        <TitleTag>
          <a href={`#/portal/noticias/${item.slug}`}>{item.title}</a>
        </TitleTag>
        <p>{item.summary}</p>
      </div>
    </article>
  );
}

/** Fila compacta de marcador: equipos, resultado u hora, y enlace al partido en toda la fila. */
export function ScoreRow({ event }: { event: PublicEventSummary }) {
  const [a, b] = sides(event);
  const sport = event.championship.sport;
  const team = (p: typeof a, side: string) => (
    <span
      className={`score-row-team ${side} ${
        event.hasResult && p?.outcome === 'victoria' ? 'winner' : ''
      }`.trim()}
    >
      {p?.name ?? 'Por definir'}
    </span>
  );
  return (
    <li className={`score-row sport-${sportKey(sport.code)}`}>
      <p className="score-row-meta">
        <SportArt sport={sport.code} size={22} />
        <span>
          {sport.name}, {event.championship.category.name}
        </span>
        <span className="score-row-state">{matchState(event)}</span>
      </p>
      <p className="score-row-teams">
        {team(a, 'local')}
        {event.hasResult ? (
          <span className="score-numbers">
            {a?.score ?? 0} — {b?.score ?? 0}
          </span>
        ) : (
          <span className="vs-badge">VS</span>
        )}
        {team(b, 'away')}
      </p>
      <a className="score-row-link" href={`#/portal/partido/${event.id}`}>
        <span className="visually-hidden">Ver detalle del partido</span>
        <Icon name="chevron-right" size={20} />
      </a>
    </li>
  );
}

export interface ScoreboardBandProps {
  recent?: PublicEventSummary[];
  upcoming?: PublicEventSummary[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function ScoreboardBand({
  recent = [],
  upcoming = [],
  loading = false,
  error = null,
  onRetry,
}: ScoreboardBandProps) {
  if (loading) {
    return (
      <section className="scoreboard-band" aria-labelledby="scoreboard-title">
        <div className="scoreboard-band-header">
          <h2 id="scoreboard-title" className="scoreboard-band-title">
            Esta semana
          </h2>
          <a href="#/portal/calendario" className="scoreboard-calendar-link">
            Calendario completo
          </a>
        </div>
        <output className="scoreboard-band-loading">
          Cargando marcadores…
        </output>
      </section>
    );
  }

  if (error) {
    return (
      <section className="scoreboard-band" aria-labelledby="scoreboard-title">
        <div className="scoreboard-band-header">
          <h2 id="scoreboard-title" className="scoreboard-band-title">
            Esta semana
          </h2>
          <a href="#/portal/calendario" className="scoreboard-calendar-link">
            Calendario completo
          </a>
        </div>
        <div className="scoreboard-band-error" role="alert">
          <p>{error}</p>
          {onRetry && (
            <button
              type="button"
              className="scoreboard-retry-btn"
              onClick={onRetry}
            >
              Reintentar
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="scoreboard-band" aria-labelledby="scoreboard-title">
      <div className="scoreboard-band-header">
        <h2 id="scoreboard-title" className="scoreboard-band-title">
          Esta semana
        </h2>
        <a href="#/portal/calendario" className="scoreboard-calendar-link">
          Calendario completo
        </a>
      </div>
      <div className="scoreboard-sections">
        <div className="scoreboard-sub-section">
          <h3 id="home-upcoming" className="scoreboard-sub-title">
            Próximos partidos
          </h3>
          {upcoming.length === 0 ? (
            <p className="scoreboard-empty">
              No hay partidos programados por ahora.
            </p>
          ) : (
            <ul className="score-list">
              {upcoming.map((e) => (
                <ScoreRow key={e.id} event={e} />
              ))}
            </ul>
          )}
        </div>
        <div className="scoreboard-sub-section">
          <h3 id="home-recent" className="scoreboard-sub-title">
            Últimos resultados oficiales
          </h3>
          {recent.length === 0 ? (
            <p className="scoreboard-empty">Aún no hay resultados aprobados.</p>
          ) : (
            <ul className="score-list">
              {recent.map((e) => (
                <ScoreRow key={e.id} event={e} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function HomePage({
  institution,
}: {
  institution: PublicInstitution | null;
}) {
  const [home, reload] = useFetch<PublicHome>('/public/home');
  const [championships] = useFetch<PublicChampionshipsResponse>(
    '/public/championships?pageSize=100',
  );
  // El conteo de clubes solo se pide si la Liga los publica (D-56).
  const [clubs] = useFetch<PublicPage<PublicClub>>(
    institution?.publication.clubs ? '/public/clubs?pageSize=1' : null,
  );
  const items = championships.kind === 'ready' ? championships.data.items : [];
  const sports = groupBySport(items);
  const standings = pickStandingsChampionship(items);
  return (
    <div className="home-page">
      <HomeHero
        next={home.kind === 'ready' ? home.data.upcoming[0] : undefined}
        institution={institution}
        season={items[0]?.season.name}
        sports={sports}
        championships={
          championships.kind === 'ready' ? championships.data.total : undefined
        }
        clubs={clubs.kind === 'ready' ? clubs.data.total : undefined}
      />
      <div className="home-body">
        <ScoreboardBand
          recent={home.kind === 'ready' ? home.data.recent : []}
          upcoming={home.kind === 'ready' ? home.data.upcoming : []}
          loading={home.kind === 'loading'}
          error={home.kind === 'error' ? home.message : null}
          onRetry={reload}
        />
        <div className="home-split">
          {home.kind === 'ready' && home.data.news.length > 0 && (
            <section
              className="portal-section home-news"
              aria-labelledby="home-news"
            >
              <div className="section-header">
                <h2 id="home-news">Últimas noticias</h2>
                <a href="#/portal/noticias">Ver todas</a>
              </div>
              <div className="news-grid">
                {home.data.news.slice(0, 3).map((n) => (
                  <NewsCard key={n.slug} item={n} headingLevel="h3" />
                ))}
              </div>
            </section>
          )}
          {standings && <StandingsSnapshot championship={standings} />}
        </div>
        <SportsShowcase sports={sports} />
      </div>
    </div>
  );
}

// ───────────────────── Calendario ─────────────────────

export function CalendarPage() {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sportId, setSportId] = useState('');
  const [championshipId, setChampionshipId] = useState('');
  const [status, setStatus] = useState('');

  const [champs] = useFetch<PublicChampionshipsResponse>(
    '/public/championships?pageSize=100',
  );

  const query = new URLSearchParams({
    page: String(page),
    pageSize: '10',
    ...(from && { from }),
    ...(to && { to }),
    ...(sportId && { sportId }),
    ...(championshipId && { championshipId }),
    ...(status && { status }),
  });
  const [events, reload] = useFetch<PublicPage<PublicEventSummary>>(
    `/public/events?${query.toString()}`,
  );

  const sports =
    champs.kind === 'ready'
      ? [
          ...new Map(
            champs.data.items.map((c) => [c.sport.id, c.sport]),
          ).values(),
        ]
      : [];
  const reset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  return (
    <section className="portal-section" aria-labelledby="calendar-title">
      <PageBanner
        id="calendar-title"
        title="Calendario de partidos"
        lead="Todos los partidos de la Liga. Filtra por fecha, deporte, campeonato o estado."
        icon="calendar"
        tone="voley"
      />
      <div className="filters">
        <TextField
          label="Desde"
          type="date"
          value={from}
          onChange={reset(setFrom)}
        />
        <TextField
          label="Hasta"
          type="date"
          value={to}
          onChange={reset(setTo)}
        />
        <SelectField
          label="Deporte"
          value={sportId}
          onChange={reset(setSportId)}
          placeholder="Todos los deportes"
          options={sports.map((s) => ({ value: s.id, label: s.name }))}
        />
        <SelectField
          label="Campeonato"
          value={championshipId}
          onChange={reset(setChampionshipId)}
          placeholder="Todos los campeonatos"
          options={
            champs.kind === 'ready'
              ? champs.data.items.map((c) => ({ value: c.id, label: c.name }))
              : []
          }
        />
        <SelectField
          label="Estado"
          value={status}
          onChange={reset(setStatus)}
          placeholder="Todos los estados"
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      <LoadState state={events} onRetry={reload} />
      {events.kind === 'ready' && events.data.items.length === 0 && (
        <p className="empty-state">
          No hay partidos para los filtros elegidos.
        </p>
      )}
      {events.kind === 'ready' && events.data.items.length > 0 && (
        <>
          <ul className="score-list">
            {events.data.items.map((e) => (
              <ScoreRow key={e.id} event={e} />
            ))}
          </ul>
          <Pagination
            page={events.data.page}
            pageSize={events.data.pageSize}
            total={events.data.total}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}

// ───────────────────── Detalle de un partido ─────────────────────

const EVENT_TYPES: Record<string, { label: string; emoji: string }> = {
  gol: { label: 'Gol', emoji: '⚽' },
  tarjeta_amarilla: { label: 'Tarjeta amarilla', emoji: '🟨' },
  tarjeta_roja: { label: 'Tarjeta roja', emoji: '🟥' },
  sustitucion: { label: 'Sustitución', emoji: '🔁' },
};
const eventType = (type: string) =>
  EVENT_TYPES[type] ?? { label: type, emoji: '•' };

type FootballEvent = NonNullable<
  PublicEventDetail['result']
>['footballEvents'][number];

/** Nómina de un equipo con su número y lo que hizo cada jugador en el partido. */
function Lineup({
  team,
  events,
}: {
  team: ScoresheetPrintData['participants'][number];
  events: FootballEvent[];
}) {
  return (
    <section className="lineup" aria-label={`Nómina de ${team.name}`}>
      <h3 className="lineup-team">{team.name}</h3>
      <ol className="lineup-list">
        {team.roster.map((player) => (
          <li key={player.code}>
            <span className="lineup-number">{player.jerseyNumber ?? '–'}</span>
            <span className="lineup-name">{player.name}</span>
            <span className="lineup-marks">
              {events
                .filter(
                  (e) => e.team === team.name && e.athleteName === player.name,
                )
                .map((e, i) => (
                  <span
                    key={i}
                    role="img"
                    aria-label={`${eventType(e.eventType).label}, minuto ${e.minute}`}
                    title={`${eventType(e.eventType).label}, minuto ${e.minute}`}
                  >
                    {eventType(e.eventType).emoji}
                  </span>
                ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MatchPage({
  eventId,
  onOpenPrint,
}: {
  eventId: string;
  onOpenPrint: (kind: 'acta' | 'nomina', id: string) => void;
}) {
  const [event, reload] = useFetch<PublicEventDetail>(
    `/public/events/${eventId}`,
  );
  // La nómina sale del acta pública, que ya oculta los nombres de menores (D-85).
  const [sheet] = useFetch<ScoresheetPrintData>(
    `/public/events/${eventId}/scoresheet`,
  );
  if (event.kind !== 'ready')
    return (
      <section className="portal-section">
        <p>
          <a href="#/portal/calendario">← Volver al calendario</a>
        </p>
        <LoadState state={event} onRetry={reload} />
      </section>
    );

  const match = event.data;
  const [a, b] = sides(match);
  const sport = match.championship.sport;
  const incidents = match.result?.footballEvents ?? [];
  const teams =
    sheet.kind === 'ready'
      ? sheet.data.participants.filter((p) => p.roster.length > 1)
      : [];
  const venue = match.venue;
  const mapQuery = venue
    ? encodeURIComponent(
        [venue.name, 'Quero, Tungurahua, Ecuador'].filter(Boolean).join(', '),
      )
    : '';

  return (
    <section className="portal-section" aria-labelledby="match-title">
      <p>
        <a href="#/portal/calendario">← Volver al calendario</a>
      </p>

      <header className={`match-hero sport-${sportKey(sport.code)}`}>
        <p className="match-hero-meta">
          <SportArt sport={sport.code} size={28} />
          {match.championship.name}, {match.championship.category.name},{' '}
          {match.round}
        </p>
        <h1 id="match-title" className="match-hero-teams">
          <span className="match-hero-team">{a?.name ?? 'Por definir'}</span>{' '}
          {match.hasResult ? (
            <span className="match-hero-score">
              <span className="visually-hidden"> vs </span>
              <span aria-hidden="true">
                {a?.score ?? 0} – {b?.score ?? 0}
              </span>
            </span>
          ) : (
            <span className="match-hero-vs">vs</span>
          )}{' '}
          <span className="match-hero-team">{b?.name ?? 'Por definir'}</span>
        </h1>
        {match.hasResult && (
          <p className="visually-hidden">
            Resultado: {a?.name} {a?.score ?? 0}, {b?.name} {b?.score ?? 0}.
          </p>
        )}
        <p className="match-hero-state">
          <Icon name="clock" size={16} />
          {matchState(match)}
        </p>
      </header>

      {match.postponementReason && (
        <p className="match-notice">
          <strong>Motivo del cambio:</strong> {match.postponementReason}
        </p>
      )}

      <div className="match-layout">
        <div className="match-main">
          {teams.length > 0 && (
            <section aria-labelledby="lineups-title">
              <h2 id="lineups-title">Alineaciones</h2>
              <p className="hint">Jugadores inscritos por cada equipo.</p>
              <div className="lineups">
                {teams.map((t) => (
                  <Lineup key={t.id} team={t} events={incidents} />
                ))}
              </div>
            </section>
          )}
          {match.result && match.result.periodScores.length > 0 && (
            <p>
              <strong>Puntuación por período:</strong>{' '}
              {match.result.periodScores
                .map((s) => `P${s.periodNumber}: ${s.score}`)
                .join(', ')}
            </p>
          )}
          <p className="row-actions">
            <button
              type="button"
              className="link-button"
              onClick={() => onOpenPrint('acta', match.id)}
            >
              <Icon name="printer" /> Ver / imprimir acta oficial
            </button>
            <CopyLink hash={`#/portal/partido/${match.id}`} />
          </p>
        </div>

        <aside className="match-side">
          {incidents.length > 0 && (
            <section
              className="match-card-panel"
              aria-labelledby="incidents-title"
            >
              <h2 id="incidents-title">Incidencias del partido</h2>
              <ol className="incidents">
                {incidents.map((fe, i) => {
                  const type = eventType(fe.eventType);
                  return (
                    <li key={i} className={`incident incident-${fe.eventType}`}>
                      <span className="incident-minute">{fe.minute}'</span>
                      <span className="incident-emoji" aria-hidden="true">
                        {type.emoji}
                      </span>
                      <span className="incident-text">
                        <strong>{type.label}</strong>
                        {fe.athleteName && <span>{fe.athleteName}</span>}
                        {fe.team && <small>{fe.team}</small>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {venue && (
            <section className="match-card-panel" aria-labelledby="venue-title">
              <h2 id="venue-title">Escenario</h2>
              <p className="venue-name">
                <Icon name="map-pin" size={18} />
                <span>
                  <strong>{venue.name}</strong>
                  {venue.address && <small>{venue.address}</small>}
                </span>
              </p>
              {/* shortcut: busca el escenario por nombre en Quero; con coordenadas guardadas en el escenario el punto sería exacto. */}
              <iframe
                className="venue-map"
                title={`Mapa de ${venue.name}`}
                src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <a
                className="venue-map-link"
                href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir en Google Maps
                <span className="visually-hidden">
                  {' '}
                  (se abre en una pestaña nueva)
                </span>
              </a>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

// ───────────────────── Noticias ─────────────────────

export function NewsListPage() {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '9',
    ...(kind && { kind }),
  });
  const [news, reload] = useFetch<PublicPage<PublicAnnouncementSummary>>(
    `/public/announcements?${query.toString()}`,
  );
  return (
    <section className="portal-section" aria-labelledby="news-title">
      <PageBanner
        id="news-title"
        title="Noticias y comunicados"
        lead="Novedades y comunicados oficiales de la Liga."
        icon="newspaper"
        tone="basquet"
      />
      <div className="filters">
        <SelectField
          label="Mostrar"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
          placeholder="Noticias y comunicados"
          options={[
            { value: 'noticia', label: 'Solo noticias' },
            { value: 'comunicado', label: 'Solo comunicados' },
          ]}
        />
      </div>
      <LoadState state={news} onRetry={reload} />
      {news.kind === 'ready' && news.data.items.length === 0 && (
        <p className="empty-state">Todavía no hay publicaciones.</p>
      )}
      {news.kind === 'ready' && news.data.items.length > 0 && (
        <>
          <div className="news-grid">
            {news.data.items.map((n) => (
              <NewsCard key={n.slug} item={n} />
            ))}
          </div>
          <Pagination
            page={news.data.page}
            pageSize={news.data.pageSize}
            total={news.data.total}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}

export function NewsArticlePage({ slug }: { slug: string }) {
  const [article, reload] = useFetch<PublicAnnouncement>(
    `/public/announcements/${slug}`,
  );
  return (
    <article className="portal-section article" aria-labelledby="article-title">
      <p>
        <a href="#/portal/noticias">← Todas las noticias</a>
      </p>
      <LoadState state={article} onRetry={reload} />
      {article.kind === 'ready' && (
        <>
          <span className="sport-tag">
            {article.data.kind === 'comunicado' ? 'Comunicado' : 'Noticia'} ·{' '}
            {dateOnly.format(new Date(article.data.publishedAt))}
          </span>
          <h1 id="article-title">{article.data.title}</h1>
          {article.data.cover && (
            <img
              className="article-cover"
              src={`/api/public/media/${article.data.cover.id}`}
              alt={article.data.cover.altText}
            />
          )}
          <p className="lead">{article.data.summary}</p>
          <Paragraphs text={article.data.content} />
          <p>
            <CopyLink hash={`#/portal/noticias/${article.data.slug}`} />
          </p>
        </>
      )}
    </article>
  );
}

// ───────────────────── Clubes ─────────────────────

export function ClubsPage() {
  const [clubs, reload] = useFetch<PublicPage<PublicClub>>(
    '/public/clubs?pageSize=100',
  );
  return (
    <section className="portal-section" aria-labelledby="clubs-title">
      <PageBanner
        id="clubs-title"
        title="Organizaciones y clubes afiliados"
        lead="Clubes y organizaciones que compiten en la Liga."
        icon="shield"
        tone="ajedrez"
      />
      <LoadState state={clubs} onRetry={reload} />
      {clubs.kind === 'ready' && clubs.data.items.length === 0 && (
        <p className="empty-state">No hay clubes para mostrar.</p>
      )}
      {clubs.kind === 'ready' && clubs.data.items.length > 0 && (
        <div className="clubs-pills-grid">
          {clubs.data.items.map((club) => (
            <div key={club.slug} className="club-pill">
              <div className="club-icon" aria-hidden="true">
                <Icon name="shield" />
              </div>
              <div className="club-info">
                <strong>{club.name}</strong>
                <small>
                  {club.sector ? `Sector ${club.sector}` : 'Quero, Tungurahua'}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────── Resoluciones ─────────────────────

export function ResolutionsPage() {
  const [page, setPage] = useState(1);
  const [list, reload] = useFetch<PublicPage<PublicResolution>>(
    `/public/resolutions?page=${page}&pageSize=10`,
  );
  return (
    <section className="portal-section" aria-labelledby="resolutions-title">
      <PageBanner
        id="resolutions-title"
        title="Resoluciones disciplinarias"
        lead="Solo se publican las resoluciones que la Liga decide hacer públicas, sin nombres de personas."
        icon="flag"
        tone="taekwondo"
      />
      <LoadState state={list} onRetry={reload} />
      {list.kind === 'ready' && list.data.items.length === 0 && (
        <p className="empty-state">No hay resoluciones publicadas.</p>
      )}
      {list.kind === 'ready' && list.data.items.length > 0 && (
        <>
          {list.data.items.map((r) => (
            <article key={r.id} className="championship-card">
              <span className="sport-tag">
                {r.code} · {dateOnly.format(new Date(r.publishedAt))}
                {r.championship ? ` · ${r.championship}` : ''}
              </span>
              <h2>{r.title}</h2>
              {r.summary && <Paragraphs text={r.summary} />}
              {r.sanctions.length > 0 && (
                <ul className="plain-list">
                  {r.sanctions.map((s, i) => (
                    <li key={i}>
                      {s.typeLabel} a {s.subject}
                      {s.team ? ` (${s.team})` : ''}
                      {s.club ? ` del club ${s.club}` : ''}
                      {s.matchesCount ? `, ${s.matchesCount} partidos` : ''}
                      {s.points ? `, ${s.points} puntos` : ''} — desde{' '}
                      {day(s.startsAt)}
                      {s.endsAt ? ` hasta ${day(s.endsAt)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}

// ───────────────────── La Liga ─────────────────────

export function AboutPage({ institution }: { institution: PublicInstitution }) {
  return (
    <section className="portal-section" aria-labelledby="about-title">
      <PageBanner
        id="about-title"
        title={institution.name}
        lead={institution.affiliation}
        icon="trophy"
        tone="atletismo"
      />
      <div className="about-layout">
        <div className="about-main">
          {institution.about ? (
            <Paragraphs text={institution.about} />
          ) : (
            <p className="empty-state">
              La Liga aún no publicó su presentación.
            </p>
          )}
          {(institution.presidentName || institution.secretaryName) && (
            <dl className="detail-list">
              {institution.presidentName && (
                <>
                  <dt>Presidente</dt>
                  <dd>{institution.presidentName}</dd>
                </>
              )}
              {institution.secretaryName && (
                <>
                  <dt>Secretario/a</dt>
                  <dd>{institution.secretaryName}</dd>
                </>
              )}
            </dl>
          )}
        </div>
        <aside className="about-card" aria-labelledby="contact">
          <h2 id="contact">Contacto</h2>
          <dl className="detail-list">
            {institution.address && (
              <>
                <dt>Dirección</dt>
                <dd>{institution.address}</dd>
              </>
            )}
            {institution.phone && (
              <>
                <dt>Teléfono</dt>
                <dd>{institution.phone}</dd>
              </>
            )}
            {institution.email && (
              <>
                <dt>Correo</dt>
                <dd>
                  <a href={`mailto:${institution.email}`}>
                    {institution.email}
                  </a>
                </dd>
              </>
            )}
            {institution.website && (
              <>
                <dt>Sitio web</dt>
                <dd>
                  <a href={institution.website} rel="noopener noreferrer">
                    {institution.website}
                  </a>
                </dd>
              </>
            )}
          </dl>
          {institution.contactInfo && (
            <Paragraphs text={institution.contactInfo} />
          )}
        </aside>
      </div>

      <h2 id="privacy">Política de privacidad</h2>
      {institution.privacyPolicy ? (
        <Paragraphs text={institution.privacyPolicy} />
      ) : (
        <p className="empty-state">
          La política de privacidad todavía no fue publicada.
        </p>
      )}
    </section>
  );
}

// ───────────────────── Verificación de documentos ─────────────────────

const VERIFY_KIND: Record<string, string> = {
  carne: 'Carné de deportista',
  certificado_inscripcion: 'Certificado de inscripción',
};

export function VerifyPage({ code }: { code?: string }) {
  const [typed, setTyped] = useState(code ?? '');
  const clean = (code ?? '').trim().toUpperCase();
  const [result, reload] = useFetch<PublicVerification>(
    clean ? `/public/verify/${encodeURIComponent(clean)}` : null,
  );
  return (
    <section className="portal-section" aria-labelledby="verify-title">
      <PageBanner
        id="verify-title"
        title="Verificar un documento"
        icon="check"
        tone="otro"
      />
      <p>
        Escriba el código de verificación impreso en el carné o certificado (o
        escanee su código QR) para comprobar que es auténtico y sigue vigente.
      </p>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          const value = typed.trim().toUpperCase();
          if (value) window.location.hash = `#/portal/verificar/${value}`;
        }}
      >
        <TextField
          label="Código de verificación"
          value={typed}
          onChange={setTyped}
          maxLength={16}
        />
        <button type="submit" className="primary">
          Verificar
        </button>
      </form>
      {clean && <LoadState state={result} onRetry={reload} />}
      {clean && result.kind === 'ready' && (
        <output
          className={`championship-card ${result.data.valid ? '' : 'invalid-doc'}`}
        >
          <h2>
            {result.data.valid ? (
              <>
                <Icon name="check" aria-hidden="true" /> Documento auténtico y
                vigente
              </>
            ) : (
              <>
                <Icon name="x" aria-hidden="true" /> Documento anulado o
                reemplazado
              </>
            )}
          </h2>
          <dl className="detail-list">
            <dt>Documento</dt>
            <dd>
              {VERIFY_KIND[result.data.kind] ?? result.data.kind} ·{' '}
              {result.data.label} (versión {result.data.version})
            </dd>
            <dt>Titular</dt>
            <dd>{result.data.holder}</dd>
            <dt>Club</dt>
            <dd>{result.data.club}</dd>
            <dt>Temporada</dt>
            <dd>{result.data.season}</dd>
            <dt>Emitido</dt>
            <dd>{dateTime.format(new Date(result.data.issuedAt))}</dd>
            {result.data.revokedAt && (
              <>
                <dt>Anulado</dt>
                <dd>{dateTime.format(new Date(result.data.revokedAt))}</dd>
              </>
            )}
          </dl>
        </output>
      )}
    </section>
  );
}
