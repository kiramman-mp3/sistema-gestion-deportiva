import ajedrezPhoto from '../../assets/photos/ajedrez-tablero.webp';
import basquetPhoto from '../../assets/photos/basquet-cancha.webp';
import futbolPhoto from '../../assets/photos/futbol-ninos.webp';
import heroPhoto from '../../assets/photos/hero-futbol-juvenil.webp';
import taekwondoPhoto from '../../assets/photos/taekwondo-combate.webp';
import { Icon } from '../../components/Icon.tsx';
import {
  SportArt,
  type SportKey,
  sportKey,
} from '../../components/SportArt.tsx';
import { useFetch } from '../../hooks/useFetch.ts';
import type {
  PublicChampionship,
  PublicEventSummary,
  PublicInstitution,
  PublicStandingsResponse,
} from './types.ts';

/** Fotos ilustrativas por deporte (ver assets/photos/README.md); los demás usan su color. */
const SPORT_PHOTOS: Partial<Record<SportKey, string>> = {
  futbol: futbolPhoto,
  basquet: basquetPhoto,
  taekwondo: taekwondoPhoto,
  ajedrez: ajedrezPhoto,
};

export interface SportGroup {
  code: string;
  name: string;
  championships: number;
}

/** Deportes con campeonatos públicos, del que más tiene al que menos. */
export function groupBySport(
  championships: PublicChampionship[],
): SportGroup[] {
  const groups = new Map<string, SportGroup>();
  for (const c of championships) {
    const group = groups.get(c.sport.code) ?? {
      code: c.sport.code,
      name: c.sport.name,
      championships: 0,
    };
    group.championships += 1;
    groups.set(c.sport.code, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.championships - a.championships || a.name.localeCompare(b.name),
  );
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Local y visitante de un partido (o los dos primeros participantes). */
export function sides(event: PublicEventSummary) {
  return [
    event.participants.find((p) => p.side === 'local') ?? event.participants[0],
    event.participants.find((p) => p.side === 'visitante') ??
      event.participants[1],
  ] as const;
}

const kickoff = new Intl.DateTimeFormat('es-EC', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const PLAIN_STATUS: Record<string, string> = {
  suspendido: 'Suspendido',
  postergado: 'Postergado',
  cancelado: 'Cancelado',
};

/** «Final», la hora del partido o su estado si no se juega como estaba previsto. */
export function matchState(event: PublicEventSummary): string {
  if (event.hasResult) return 'Final';
  if (PLAIN_STATUS[event.status]) return PLAIN_STATUS[event.status];
  return event.scheduledAt
    ? kickoff.format(new Date(event.scheduledAt))
    : 'Fecha por definir';
}

/** Franja de marcadores de la semana; se desplaza en horizontal sin mover la página. */
export function ScoreTicker({ events }: { events: PublicEventSummary[] }) {
  if (events.length === 0) return null;
  return (
    <nav className="score-ticker" aria-label="Marcadores de la semana">
      <ul>
        {events.map((e) => {
          const [a, b] = sides(e);
          const team = (p: typeof a) => (
            <span
              className={`ticker-team ${
                e.hasResult && p?.outcome === 'victoria' ? 'ticker-winner' : ''
              }`.trim()}
            >
              <span>{p?.name ?? 'Por definir'}</span>
              {e.hasResult && <b>{p?.score ?? 0}</b>}
            </span>
          );
          return (
            <li key={e.id}>
              <a
                href={`#/portal/partido/${e.id}`}
                className={`sport-${sportKey(e.championship.sport.code)}`}
              >
                <span className="ticker-state">{matchState(e)}</span>
                {team(a)}
                {team(b)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface HomeHeroProps {
  institution: PublicInstitution | null;
  /** Temporada de los campeonatos publicados (si hay). */
  season?: string;
  sports: SportGroup[];
  championships?: number;
  clubs?: number;
  /** Partido destacado: el próximo del calendario. */
  next?: PublicEventSummary;
}

/**
 * Portada a todo el ancho: foto de la Liga (si la subió) o una ilustrativa, el nombre,
 * accesos, el próximo partido y las cifras reales de la Liga.
 */
export function HomeHero({
  institution,
  season,
  sports,
  championships,
  clubs,
  next,
}: HomeHeroProps) {
  const ownPhoto = institution?.hasCover === true;
  const name = institution?.name ?? 'Liga Deportiva Cantonal de Quero';
  const stats = [
    championships !== undefined && {
      n: championships,
      label: championships === 1 ? 'campeonato' : 'campeonatos',
    },
    sports.length > 0 && {
      n: sports.length,
      label: sports.length === 1 ? 'deporte' : 'deportes',
    },
    clubs !== undefined && { n: clubs, label: clubs === 1 ? 'club' : 'clubes' },
  ].filter((s): s is { n: number; label: string } => Boolean(s));

  return (
    <section className="home-hero" aria-labelledby="home-title">
      <img
        className="home-hero-photo"
        src={ownPhoto ? '/api/public/institution/cover' : heroPhoto}
        alt=""
      />
      <span className="home-hero-shade" />
      {!ownPhoto && <p className="home-hero-credit">Foto ilustrativa</p>}

      <div className="home-hero-inner">
        <div className="home-hero-content">
          <p className="home-hero-kicker">
            <Icon name="trophy" size={18} />
            {season ?? 'Deporte cantonal'}
          </p>
          <h1 id="home-title" className="home-hero-title">
            {name}
          </h1>
          <p className="home-hero-lead">
            {institution?.affiliation ? `${institution.affiliation}. ` : ''}
            Resultados oficiales, calendario y noticias de los campeonatos de la
            Liga.
          </p>
          <div className="home-hero-actions">
            <a className="hero-cta hero-cta-primary" href="#/portal/calendario">
              <Icon name="calendar" size={20} />
              Ver calendario
            </a>
            <a
              className="hero-cta hero-cta-secondary"
              href="#/portal/competencias"
            >
              <Icon name="trophy" size={20} />
              Competencias
            </a>
          </div>
        </div>
        {next && <NextMatch event={next} />}
      </div>

      {stats.length > 0 && (
        <ul className="home-hero-stats" aria-label="La Liga en cifras">
          {stats.map((s) => (
            <li key={s.label}>
              <strong>{s.n}</strong> {s.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tarjeta del próximo partido dentro de la portada. */
function NextMatch({ event }: { event: PublicEventSummary }) {
  const [a, b] = sides(event);
  const sport = event.championship.sport;
  return (
    <article
      className={`next-match sport-${sportKey(sport.code)}`}
      aria-labelledby="next-match-title"
    >
      <h2 id="next-match-title" className="next-match-title">
        <SportArt sport={sport.code} size={32} />
        Próximo partido
      </h2>
      <p className="next-match-competition">
        {event.championship.name}, {event.round}
      </p>
      <p className="next-match-teams">
        <span>{a?.name ?? 'Por definir'}</span>
        <span className="next-match-vs">vs</span>
        <span>{b?.name ?? 'Por definir'}</span>
      </p>
      <p className="next-match-info">
        <Icon name="clock" size={16} />
        {matchState(event)}
      </p>
      <p className="next-match-info">
        <Icon name="map-pin" size={16} />
        {event.venue?.name ?? 'Escenario por confirmar'}
      </p>
      <a className="next-match-link" href={`#/portal/partido/${event.id}`}>
        Ver detalle del partido
      </a>
    </article>
  );
}

/** Campeonato de la portada: el primero de fútbol por puntos; si no hay, cualquiera por puntos. */
export function pickStandingsChampionship(
  championships: PublicChampionship[],
): PublicChampionship | undefined {
  const league = championships.filter((c) => c.format === 'todos_contra_todos');
  return league.find((c) => sportKey(c.sport.code) === 'futbol') ?? league[0];
}

/** Los primeros puestos de un campeonato, con enlace a la tabla completa. */
export function StandingsSnapshot({
  championship,
}: {
  championship: PublicChampionship;
}) {
  const [standings] = useFetch<PublicStandingsResponse>(
    `/public/championships/${championship.id}/standings`,
  );
  const rows =
    standings.kind === 'ready' ? standings.data.standings.slice(0, 6) : [];
  if (rows.length === 0) return null;
  return (
    <section
      className={`home-standings sport-${sportKey(championship.sport.code)}`}
      aria-labelledby="home-standings"
    >
      <div className="section-header">
        <h2 id="home-standings">Tabla de posiciones</h2>
        <a href={`#/portal/competencias/${championship.id}`}>Tabla completa</a>
      </div>
      <table className="standings-mini">
        <caption>
          {championship.name}, {championship.category.name}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <abbr title="Posición">#</abbr>
            </th>
            <th scope="col">Equipo</th>
            <th scope="col">
              <abbr title="Partidos jugados">PJ</abbr>
            </th>
            <th scope="col">
              <abbr title="Diferencia de goles">DG</abbr>
            </th>
            <th scope="col">
              <abbr title="Puntos">Pts</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.registrationId}>
              <td>{r.position}</td>
              <th scope="row">{r.name}</th>
              <td>{r.played}</td>
              <td>
                {r.goalDifference > 0
                  ? `+${r.goalDifference}`
                  : r.goalDifference}
              </td>
              <td>
                <strong>{r.points}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Mosaico de deportes con su foto y color; cada uno lleva a sus campeonatos. */
export function SportsShowcase({ sports }: { sports: SportGroup[] }) {
  if (sports.length === 0) return null;
  const usesStock = sports.some((s) => SPORT_PHOTOS[sportKey(s.code)]);
  return (
    <section className="portal-section" aria-labelledby="home-sports">
      <div className="section-header">
        <h2 id="home-sports">Nuestros deportes</h2>
        <a href="#/portal/competencias">Todas las competencias</a>
      </div>
      <ul className="sport-cards">
        {sports.map((s) => {
          const key = sportKey(s.code);
          const photo = SPORT_PHOTOS[key];
          return (
            <li key={s.code} className={`sport-${key}`}>
              <a
                className="sport-card-link"
                href={`#/portal/competencias?deporte=${encodeURIComponent(s.code)}`}
              >
                {photo ? (
                  <img className="sport-card-photo" src={photo} alt="" />
                ) : (
                  <span className="sport-card-pattern" />
                )}
                <span className="sport-card-body">
                  <SportArt sport={s.code} size={48} />
                  <span className="sport-card-name">{s.name}</span>
                  <span className="sport-card-count">
                    {plural(s.championships, 'campeonato', 'campeonatos')}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {usesStock && <p className="hint">Fotos ilustrativas.</p>}
    </section>
  );
}
