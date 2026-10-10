/*
 * Ilustraciones planas de cada deporte, dibujadas para este proyecto (sin licencias de terceros).
 * Son decorativas: el nombre del deporte siempre aparece como texto junto a ellas.
 * El color sale de la clase .sport-<clave> (variable --sport, ver styles.css) y de --color-art-*.
 */
import { useId } from 'react';

export const SPORT_KEYS = [
  'futbol',
  'basquet',
  'taekwondo',
  'ajedrez',
  'voley',
  'atletismo',
  'otro',
] as const;

export type SportKey = (typeof SPORT_KEYS)[number];

const ALIASES: Record<string, SportKey> = {
  futbol: 'futbol',
  futbol_sala: 'futbol',
  indor: 'futbol',
  indorfutbol: 'futbol',
  basquet: 'basquet',
  basket: 'basquet',
  baloncesto: 'basquet',
  basquetbol: 'basquet',
  taekwondo: 'taekwondo',
  ajedrez: 'ajedrez',
  voley: 'voley',
  voleibol: 'voley',
  ecuavoley: 'voley',
  volley: 'voley',
  atletismo: 'atletismo',
};

/** Normaliza el código de un deporte (sin tildes ni mayúsculas) a una de las claves con color. */
export function sportKey(code: string | null | undefined): SportKey {
  if (!code) return 'otro';
  const normalized = code
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return ALIASES[normalized] ?? ALIASES[normalized.replace(/_/g, '')] ?? 'otro';
}

const INK = 'var(--color-art-ink)';
const PAPER = 'var(--color-art-paper)';

function Art({ sport, uid }: { sport: SportKey; uid: string }) {
  const color = 'var(--sport)';
  const stroke = {
    stroke: INK,
    strokeWidth: 3,
    strokeLinejoin: 'round' as const,
  };
  switch (sport) {
    case 'futbol':
      return (
        <>
          <defs>
            <clipPath id={`${uid}-ball`}>
              <circle cx="50" cy="50" r="42" />
            </clipPath>
          </defs>
          <circle cx="50" cy="50" r="42" fill={PAPER} />
          <g clipPath={`url(#${uid}-ball)`} fill={color} {...stroke}>
            <polygon points="50,10 58.6,16.2 55.3,26.3 44.7,26.3 41.4,16.2" />
            <polygon points="88,37.6 91.3,47.7 82.7,54 74.1,47.7 77.4,37.6" />
            <polygon points="73.5,82.4 64.9,88.6 56.3,82.4 59.6,72.3 70.2,72.3" />
            <polygon points="26.5,82.4 29.8,72.3 40.4,72.3 43.7,82.4 35.1,88.6" />
            <polygon points="12,37.6 22.6,37.6 25.9,47.7 17.3,54 8.7,47.7" />
          </g>
          <polygon
            points="50,36 63.3,45.7 58.2,61.3 41.8,61.3 36.7,45.7"
            fill={color}
            {...stroke}
          />
          <path
            d="M50 36V26M63.3 45.7l11-2.5M58.2 61.3l6 10M41.8 61.3l-6 10M36.7 45.7l-11-2.5"
            fill="none"
            {...stroke}
          />
          <circle cx="50" cy="50" r="42" fill="none" {...stroke} />
        </>
      );
    case 'basquet':
      return (
        <>
          <circle cx="50" cy="50" r="42" fill={color} {...stroke} />
          <path
            d="M50 8v84M8 50h84M22 20q22 30 0 60M78 20q-22 30 0 60"
            fill="none"
            {...stroke}
          />
        </>
      );
    case 'taekwondo':
      return (
        <>
          <rect
            x="8"
            y="38"
            width="84"
            height="16"
            rx="4"
            fill={color}
            {...stroke}
          />
          <path d="M45 54 33 88l11 3 9-34z" fill={color} {...stroke} />
          <path d="M55 54l12 34-10 3-9-34z" fill={color} {...stroke} />
          <rect
            x="39"
            y="32"
            width="22"
            height="28"
            rx="5"
            fill={color}
            {...stroke}
          />
          <path d="M39 46h22" fill="none" {...stroke} />
        </>
      );
    case 'ajedrez':
      return (
        <>
          <path
            d="M28 14h9v8h8v-8h10v8h8v-8h9v20H28z"
            fill={color}
            {...stroke}
          />
          <path d="M34 34h32l4 38H30z" fill={color} {...stroke} />
          <rect
            x="24"
            y="72"
            width="52"
            height="10"
            rx="3"
            fill={color}
            {...stroke}
          />
          <rect
            x="18"
            y="82"
            width="64"
            height="9"
            rx="3"
            fill={PAPER}
            {...stroke}
          />
        </>
      );
    case 'voley':
      return (
        <>
          <circle cx="50" cy="50" r="42" fill={PAPER} />
          <path
            d="M50 50Q70 40 71 13.6A42 42 0 0 0 8 50Q28 44 50 50z"
            fill={color}
          />
          <path
            d="M50 50Q28 44 8 50A42 42 0 0 0 29 86.4Q50 72 50 50z"
            fill="var(--color-accent)"
          />
          <path
            d="M50 50Q70 40 71 13.6M50 50Q28 44 8 50M50 50Q50 72 29 86.4"
            fill="none"
            {...stroke}
          />
          <circle cx="50" cy="50" r="42" fill="none" {...stroke} />
        </>
      );
    case 'atletismo':
      return (
        <>
          <rect
            x="43"
            y="6"
            width="14"
            height="10"
            rx="3"
            fill={color}
            {...stroke}
          />
          <path d="M72 22l7-7" fill="none" {...stroke} />
          <circle cx="50" cy="56" r="36" fill={PAPER} {...stroke} />
          <path d="M50 56V34M50 56l14 10" fill="none" {...stroke} />
          <path d="M50 20a36 36 0 0 1 36 36H50z" fill={color} opacity="0.85" />
          <circle cx="50" cy="56" r="36" fill="none" {...stroke} />
          <circle cx="50" cy="56" r="4" fill={INK} />
        </>
      );
    case 'otro':
      return (
        <>
          <path
            d="M30 12h40v22a20 20 0 0 1-40 0z"
            fill="var(--color-accent)"
            {...stroke}
          />
          <path
            d="M30 18H16v6a14 14 0 0 0 14 14M70 18h14v6a14 14 0 0 1-14 14"
            fill="none"
            {...stroke}
          />
          <path d="M44 54h12v14H44z" fill="var(--color-accent)" {...stroke} />
          <rect
            x="30"
            y="68"
            width="40"
            height="12"
            rx="3"
            fill={color}
            {...stroke}
          />
          <rect
            x="24"
            y="80"
            width="52"
            height="10"
            rx="3"
            fill={color}
            {...stroke}
          />
        </>
      );
  }
}

/** Ilustración del deporte (decorativa). Acepta el código del deporte tal como llega de la API. */
export function SportArt({
  sport,
  size = 64,
  className = '',
}: {
  sport: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const key = sportKey(sport);
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      className={`sport-art sport-${key} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-sport={key}
    >
      <Art sport={key} uid={uid} />
    </svg>
  );
}

/** Piezas del confeti: posición (clase confetti-piece-N en styles.css), forma y color. */
const CONFETTI: {
  shape: 'dot' | 'bar' | 'tri';
  tone: SportKey | 'accent';
}[] = [
  { shape: 'dot', tone: 'accent' },
  { shape: 'bar', tone: 'futbol' },
  { shape: 'tri', tone: 'basquet' },
  { shape: 'dot', tone: 'ajedrez' },
  { shape: 'bar', tone: 'taekwondo' },
  { shape: 'tri', tone: 'accent' },
  { shape: 'dot', tone: 'voley' },
  { shape: 'bar', tone: 'basquet' },
  { shape: 'bar', tone: 'accent' },
  { shape: 'dot', tone: 'futbol' },
];

/** Confeti decorativo en los colores de los deportes y el acento (posiciones fijas, no aleatorias). */
export function Confetti({ className = '' }: { className?: string }) {
  return (
    <span className={`confetti ${className}`.trim()} aria-hidden="true">
      {CONFETTI.map((p, i) => (
        <span
          key={i}
          className={`confetti-piece confetti-piece-${i + 1} confetti-${p.shape} ${
            p.tone === 'accent' ? 'confetti-accent' : `sport-${p.tone}`
          }`}
        />
      ))}
    </span>
  );
}
