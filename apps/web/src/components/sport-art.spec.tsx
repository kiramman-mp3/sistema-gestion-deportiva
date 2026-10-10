import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SportArt, sportKey } from './SportArt.tsx';

describe('sportKey', () => {
  it('reconoce los deportes por su código, sin tildes ni mayúsculas', () => {
    expect(sportKey('futbol')).toBe('futbol');
    expect(sportKey('Fútbol')).toBe('futbol');
    expect(sportKey('baloncesto')).toBe('basquet');
    expect(sportKey('ECUAVÓLEY')).toBe('voley');
    expect(sportKey('fútbol sala')).toBe('futbol');
    expect(sportKey('taekwondo')).toBe('taekwondo');
  });

  it('usa el color e ilustración genéricos para deportes desconocidos o vacíos', () => {
    expect(sportKey('bochas')).toBe('otro');
    expect(sportKey('')).toBe('otro');
    expect(sportKey(null)).toBe('otro');
  });
});

describe('SportArt', () => {
  it('es decorativa: oculta a lectores de pantalla y sin foco', () => {
    const { container } = render(<SportArt sport="ajedrez" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('data-sport', 'ajedrez');
  });

  it('dibuja el trofeo genérico para un deporte sin ilustración propia', () => {
    const { container } = render(<SportArt sport="bochas" />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'data-sport',
      'otro',
    );
  });

  it('cada balón usa su propio recorte (sin ids repetidos)', () => {
    const { container } = render(
      <>
        <SportArt sport="futbol" />
        <SportArt sport="futbol" />
      </>,
    );
    const ids = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const g of container.querySelectorAll('g[clip-path]'))
      expect(ids).toContain(
        g.getAttribute('clip-path')!.replace(/^url\(#|\)$/g, ''),
      );
  });
});
