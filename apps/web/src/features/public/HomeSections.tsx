import ajedrezPhoto from '../../assets/photos/ajedrez-tablero.webp';
import basquetPhoto from '../../assets/photos/basquet-cancha.webp';
import futbolPhoto from '../../assets/photos/futbol-ninos.webp';
import heroPhoto from '../../assets/photos/hero-futbol-juvenil.webp';
import taekwondoPhoto from '../../assets/photos/taekwondo-combate.webp';
import { Icon } from '../../components/Icon.tsx';
import {
  Confetti,
  SportArt,
  type SportKey,
  sportKey,
} from '../../components/SportArt.tsx';
import type { PublicChampionship, PublicInstitution } from './types.ts';

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

export interface HomeHeroProps {
  institution: PublicInstitution | null;
  /** Temporada de los campeonatos publicados (si hay). */
  season?: string;
  sports: SportGroup[];
  championships?: number;
  clubs?: number;
}

/**
 * Portada: foto de la Liga (si la subió) o una foto ilustrativa, con el nombre, accesos y
 * cifras reales. Los adornos (pegatinas de deportes y confeti) son decorativos.
 */
export function HomeHero({
  institution,
  season,
  sports,
  championships,
  clubs,
}: HomeHeroProps) {
  const ownPhoto = institution?.hasCover === true;
  const name = institution?.name ?? 'Liga Deportiva Cantonal de Quero';
  const stats = [
    championships !== undefined &&
      plural(championships, 'campeonato', 'campeonatos'),
    sports.length > 0 && plural(sports.length, 'deporte', 'deportes'),
    clubs !== undefined && plural(clubs, 'club', 'clubes'),
  ].filter((s): s is string => Boolean(s));

  return (
    <section className="home-hero" aria-labelledby="home-title">
      <img
        className="home-hero-photo"
        src={ownPhoto ? '/api/public/institution/cover' : heroPhoto}
        alt=""
      />
      <span className="home-hero-shade" />
      <Confetti className="home-hero-confetti" />
      <span className="home-hero-stickers" aria-hidden="true">
        {sports.slice(0, 4).map((s, i) => (
          <SportArt
            key={s.code}
            sport={s.code}
            size={96}
            className={`home-hero-sticker home-hero-sticker-${i + 1}`}
          />
        ))}
      </span>
      {!ownPhoto && <p className="home-hero-credit">Foto ilustrativa</p>}

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
        {stats.length > 0 && (
          <ul className="home-hero-stats" aria-label="La Liga en cifras">
            {stats.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Tarjetas de cada deporte con su color, su ilustración y un enlace a sus campeonatos. */
export function SportsShowcase({ sports }: { sports: SportGroup[] }) {
  if (sports.length === 0) return null;
  const usesStock = sports.some((s) => SPORT_PHOTOS[sportKey(s.code)]);
  return (
    <section
      className="portal-section home-sports"
      aria-labelledby="home-sports"
    >
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
                  <SportArt sport={s.code} size={64} />
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
