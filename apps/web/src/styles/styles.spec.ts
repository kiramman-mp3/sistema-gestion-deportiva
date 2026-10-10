/**
 * Comprobaciones estáticas de la hoja de estilos (D-95):
 * - toda variable CSS usada está definida;
 * - el modo oscuro redefine todos los colores del modo claro;
 * - los pares de texto y fondo cumplen el contraste AA en ambos modos;
 * - no hay `transition: all`.
 */
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Se leen del disco: en Vitest, importar CSS (incluso con `?raw`) devuelve una cadena vacía.
// Vitest se ejecuta con apps/web como directorio de trabajo (npm run test -w @liga/web).
const SRC = join(process.cwd(), 'src');
const sources: Record<string, string> = Object.fromEntries(
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(css|tsx)$/.test(f))
    .map((f) => [
      `/src/${f.replaceAll('\\', '/')}`,
      readFileSync(join(SRC, f), 'utf8'),
    ]),
);

const css = Object.entries(sources)
  .filter(([path]) => path.endsWith('.css'))
  .map(([, text]) => text)
  .join('\n');
const tokens = sources['/src/styles/tokens.css']!;

/** Declaraciones `--nombre: valor` de un fragmento de CSS. */
function declarations(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi))
    map.set(m[1]!, m[2]!.trim());
  return map;
}

/** Bloque `:root { … }` (el primero) dentro de un texto. */
function rootBlock(text: string): string {
  const start = text.indexOf(':root {');
  return text.slice(start, text.indexOf('\n}', start));
}

const darkStart = tokens.indexOf('@media (prefers-color-scheme: dark)');
const light = declarations(rootBlock(tokens.slice(0, darkStart)));
const dark = new Map([
  ...light,
  ...declarations(rootBlock(tokens.slice(darkStart))),
]);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Resuelve `var(--x)` hasta llegar a un color hexadecimal. */
function resolve(theme: Map<string, string>, name: string): string {
  let value = theme.get(name);
  for (let i = 0; value?.startsWith('var(') && i < 5; i++)
    value = theme.get(value.slice(4, -1).trim());
  if (!value || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${name} no resuelve a un color hexadecimal: ${value}`);
  return value;
}

describe('estilos: tokens de diseño', () => {
  it('toda variable CSS usada en CSS o TSX está definida', () => {
    const defined = new Set(
      [...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
    );
    const used = new Set(
      Object.values(sources).flatMap((text) =>
        [...text.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]),
      ),
    );
    const missing = [...used].filter((name) => !defined.has(name));
    expect(missing).toEqual([]);
  });

  it('el modo oscuro redefine cada color del modo claro', () => {
    const darkOnly = declarations(rootBlock(tokens.slice(darkStart)));
    const lightColors = [...light.keys()].filter((k) =>
      k.startsWith('--color-'),
    );
    expect(lightColors.length).toBeGreaterThan(20);
    expect(lightColors.filter((k) => !darkOnly.has(k))).toEqual([]);
  });

  // Pares de texto sobre fondo que usa la interfaz (WCAG 2.x AA: 4,5:1).
  const TEXT_PAIRS: [string, string][] = [
    ['--color-text', '--color-bg'],
    ['--color-text', '--color-surface'],
    ['--color-text', '--color-surface-sunken'],
    ['--color-text-muted', '--color-bg'],
    ['--color-text-muted', '--color-surface'],
    ['--color-primary', '--color-surface'],
    ['--color-primary', '--color-bg'],
    ['--color-on-primary', '--color-primary'],
    ['--color-on-brand', '--color-brand'],
    ['--color-on-accent', '--color-accent'],
    ['--color-success', '--color-surface'],
    ['--color-success', '--color-success-bg'],
    ['--color-warning', '--color-warning-bg'],
    ['--color-danger', '--color-surface'],
    ['--color-danger', '--color-danger-bg'],
    ['--color-on-danger-strong', '--color-danger-strong'],
    ['--color-info', '--color-surface'],
    ['--color-info', '--color-info-bg'],
  ];

  for (const [themeName, theme] of [
    ['claro', light],
    ['oscuro', dark],
  ] as const) {
    it.each(TEXT_PAIRS)(
      `contraste AA en modo ${themeName}: %s sobre %s`,
      (fg, bg) => {
        expect(
          contrast(resolve(theme, fg), resolve(theme, bg)),
        ).toBeGreaterThanOrEqual(4.5);
      },
    );

    it(`foco y bordes de campos se distinguen (3:1) en modo ${themeName}`, () => {
      for (const bg of ['--color-bg', '--color-surface']) {
        expect(
          contrast(resolve(theme, '--color-focus'), resolve(theme, bg)),
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrast(
            resolve(theme, '--color-control-border'),
            resolve(theme, bg),
          ),
        ).toBeGreaterThanOrEqual(3);
      }
      expect(
        contrast(
          resolve(theme, '--color-accent'),
          resolve(theme, '--color-brand'),
        ),
      ).toBeGreaterThanOrEqual(3);
    });
  }

  it('no hay transiciones de todas las propiedades', () => {
    expect(css).not.toMatch(/transition\s*:\s*all\b/);
  });
});
