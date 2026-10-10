/**
 * Comprobaciones estáticas de la hoja de estilos (D-95):
 * - toda variable CSS usada está definida;
 * - el modo oscuro redefine todos los colores del modo claro;
 * - los pares de texto y fondo cumplen el contraste AA en ambos modos;
 * - no hay `transition: all`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { STATUS_TONE_MAP, type BadgeTone } from '../components/StatusBadge.tsx';

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

/**
 * Clases del documento oficial impreso que no llevan estilo de pantalla a propósito:
 * darles uno cambiaría el acta o la nómina (D-53). Solo `print.css` puede tocar la hoja.
 */
const OFFICIAL_SHEET_UNSTYLED = new Set([
  'header-seal',
  'seal-emblem',
  'header-text',
  'meta-item',
  'status-tag',
  'subscores-section',
  'lineups-section',
  'empty-cell',
  'roster-table-section',
]);

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
    // Deportes: sólido con su texto, suave con el texto normal y el color como texto.
    ['--color-on-sport', '--color-sport-futbol'],
    ['--color-text', '--color-sport-futbol-soft'],
    ['--color-sport-futbol', '--color-surface'],
    ['--color-on-sport', '--color-sport-basquet'],
    ['--color-text', '--color-sport-basquet-soft'],
    ['--color-sport-basquet', '--color-surface'],
    ['--color-on-sport', '--color-sport-taekwondo'],
    ['--color-text', '--color-sport-taekwondo-soft'],
    ['--color-sport-taekwondo', '--color-surface'],
    ['--color-on-sport', '--color-sport-ajedrez'],
    ['--color-text', '--color-sport-ajedrez-soft'],
    ['--color-sport-ajedrez', '--color-surface'],
    ['--color-on-sport', '--color-sport-voley'],
    ['--color-text', '--color-sport-voley-soft'],
    ['--color-sport-voley', '--color-surface'],
    ['--color-on-sport', '--color-sport-atletismo'],
    ['--color-text', '--color-sport-atletismo-soft'],
    ['--color-sport-atletismo', '--color-surface'],
    ['--color-on-sport', '--color-sport-otro'],
    ['--color-text', '--color-sport-otro-soft'],
    ['--color-sport-otro', '--color-surface'],
    ['--color-art-ink', '--color-art-paper'],
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

  it('toda clase usada en TSX existe en el CSS', () => {
    const defined = new Set(
      [...css.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]!),
    );
    const used = new Set<string>();

    const addClass = (cls: string) => {
      const clean = cls.trim();
      if (!clean || clean.endsWith('-') || /[^a-zA-Z0-9_-]/.test(clean)) return;
      used.add(clean);
    };

    const extractFromNode = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        node.text.split(/\s+/).forEach(addClass);
      } else if (ts.isTemplateExpression(node)) {
        node.head.text.split(/\s+/).forEach(addClass);
        for (const span of node.templateSpans) {
          span.literal.text.split(/\s+/).forEach(addClass);
          extractFromNode(span.expression);
        }
      } else if (ts.isConditionalExpression(node)) {
        extractFromNode(node.whenTrue);
        extractFromNode(node.whenFalse);
      } else if (ts.isBinaryExpression(node)) {
        extractFromNode(node.left);
        extractFromNode(node.right);
      } else if (ts.isCallExpression(node)) {
        if (ts.isPropertyAccessExpression(node.expression)) {
          extractFromNode(node.expression.expression);
        }
        for (const arg of node.arguments) {
          extractFromNode(arg);
        }
      } else if (ts.isParenthesizedExpression(node)) {
        extractFromNode(node.expression);
      }
    };

    const tsxSources = Object.entries(sources).filter(
      ([path]) => path.endsWith('.tsx') && !path.endsWith('.spec.tsx'),
    );

    for (const [path, content] of tsxSources) {
      const sf = ts.createSourceFile(
        path,
        content,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (n: ts.Node) => {
        if (
          ts.isJsxAttribute(n) &&
          ts.isIdentifier(n.name) &&
          n.name.text === 'className' &&
          n.initializer
        ) {
          if (ts.isStringLiteral(n.initializer)) {
            extractFromNode(n.initializer);
          } else if (
            ts.isJsxExpression(n.initializer) &&
            n.initializer.expression
          ) {
            extractFromNode(n.initializer.expression);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }

    // Enumerar valores de plantillas badge-${tone} y status-${status} (spec §8 y §10)
    const TONES: BadgeTone[] = [
      'neutral',
      'warning',
      'success',
      'danger',
      'info',
      'live',
    ];
    for (const tone of TONES) {
      addClass(`badge-${tone}`);
      addClass(`status-${tone}`);
    }
    for (const status of Object.keys(STATUS_TONE_MAP)) {
      addClass(`status-${status}`);
    }
    for (const variant of ['primary', 'secondary', 'danger', 'ghost']) {
      addClass(`btn-${variant}`);
    }
    for (const size of ['sm', 'md', 'lg']) {
      addClass(`btn-${size}`);
    }

    const missing = [...used].filter(
      (name) => !defined.has(name) && !OFFICIAL_SHEET_UNSTYLED.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('las hojas de pantalla no dan estilo a las clases del documento oficial', () => {
    const screenCss = Object.entries(sources)
      .filter(([path]) => path.endsWith('.css') && !path.endsWith('/print.css'))
      .map(([, text]) => text)
      .join('\n');
    const styled = [...OFFICIAL_SHEET_UNSTYLED].filter((name) =>
      new RegExp(`\\.${name}(?![\\w-])`).test(screenCss),
    );
    expect(styled).toEqual([]);
  });
});
