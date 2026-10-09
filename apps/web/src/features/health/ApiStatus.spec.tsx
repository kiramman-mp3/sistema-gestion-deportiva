import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiStatus } from './ApiStatus.tsx';

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('ApiStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('muestra el estado de carga y luego que el servidor está operativo', async () => {
    mockFetch(() =>
      jsonResponse({ status: 'ok', service: 'liga-api', timestamp: 'x' }),
    );
    render(<ApiStatus />);
    expect(screen.getByText(/Comprobando conexión/)).toBeInTheDocument();
    expect(await screen.findByText(/Servidor operativo/)).toBeInTheDocument();
  });

  it('muestra un error y permite reintentar', async () => {
    mockFetch(() => Promise.reject(new TypeError('network')));
    render(<ApiStatus />);
    expect(
      await screen.findByText(/No se pudo conectar con el servidor/),
    ).toBeInTheDocument();

    mockFetch(() =>
      jsonResponse({ status: 'ok', service: 'liga-api', timestamp: 'x' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Servidor operativo/)).toBeInTheDocument();
  });

  it('informa cuando el servidor responde con un error HTTP', async () => {
    mockFetch(() => jsonResponse({}, 503));
    render(<ApiStatus />);
    expect(await screen.findByText(/error \(503\)/)).toBeInTheDocument();
  });
});
