import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixturesTab } from '../features/competitions/FixturesTab.tsx';
import { MatchScoresheetDialog } from '../features/competitions/MatchScoresheetDialog.tsx';
import type {
  Championship,
  CompetitionEvent,
  Registration,
} from '../features/competitions/types.js';
import { ComplaintDialog } from '../features/discipline/DisciplinePage.tsx';
import { IncidentDialog } from '../features/discipline/IncidentDialog.tsx';
import { EventAssignmentsDialog } from '../features/officials/EventAssignmentsDialog.tsx';
import { json, mockApi } from '../test/mockApi.ts';

const CHAMPIONSHIP_MOCK: Championship = {
  id: 'champ-1',
  name: 'Campeonato 2026',
  format: 'todos_contra_todos',
  status: 'en_curso',
  season: { id: 'sea-1', name: '2026', status: 'activa' },
  sport: { id: 'sp-1', code: 'FUT', name: 'Fútbol' },
  category: {
    id: 'cat-1',
    name: 'Senior',
    code: 'SR',
    ageMin: null,
    ageMax: null,
  },
};

const REG_A = {
  id: 'reg-1',
  championshipId: 'champ-1',
  status: 'aprobada' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  participant: {
    kind: 'equipo' as const,
    team: {
      team: {
        id: 't-1',
        name: 'Equipo A',
        club: { id: 'c-1', name: 'Club A' },
      },
    },
  },
};

const REG_B = {
  id: 'reg-2',
  championshipId: 'champ-1',
  status: 'aprobada' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  participant: {
    kind: 'equipo' as const,
    team: {
      team: {
        id: 't-2',
        name: 'Equipo B',
        club: { id: 'c-2', name: 'Club B' },
      },
    },
  },
};

const EVENT_MOCK: CompetitionEvent = {
  id: 'event-1',
  status: 'programado',
  scheduledAt: '2026-07-01T15:00:00Z',
  venue: { id: 'ven-1', name: 'Estadio Central', capacity: 100 },
  round: {
    id: 'round-1',
    name: 'Fecha 1',
    roundNumber: 1,
    stage: {
      id: 'stage-1',
      name: 'Fase Regular',
      sequence: 1,
      stageType: 'grupo',
    },
  },
  participants: [
    {
      id: 'part-1',
      side: 'local',
      registration: REG_A as unknown as Registration,
    },
    {
      id: 'part-2',
      side: 'visitante',
      registration: REG_B as unknown as Registration,
    },
  ],
};

describe('Accesibilidad y comportamiento de los cinco diálogos (Modal)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Diálogo de reprogramación en FixturesTab', () => {
    it('cierra con Escape sin peticiones de reprogramación, atrapa el foco y lo devuelve al botón que lo abrió', async () => {
      const { calls } = mockApi({
        'GET /championships/champ-1/stages': () =>
          json([
            {
              id: 'stage-1',
              name: 'Fase Regular',
              type: 'grupo',
              order: 1,
              status: 'en_curso',
              rounds: [{ id: 'round-1', name: 'Fecha 1', order: 1 }],
            },
          ]),
        'GET /championships/champ-1/events': () => json([EVENT_MOCK]),
        'GET /venues?limit=100': () => json({ items: [EVENT_MOCK.venue] }),
      });

      render(
        <FixturesTab
          championship={CHAMPIONSHIP_MOCK}
          registrations={[
            REG_A as unknown as Registration,
            REG_B as unknown as Registration,
          ]}
          permissions={['fixtures:manage']}
        />,
      );

      const rescheduleBtn = await screen.findByRole('button', {
        name: 'Reprogramar',
      });
      rescheduleBtn.focus();
      await userEvent.click(rescheduleBtn);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');

      // Foco atrapado dentro del diálogo
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      );
      expect(focusable.length).toBeGreaterThan(1);
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(document.activeElement).toBe(first);

      first.focus();
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);

      // Escape cierra el modal
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Ninguna petición POST /events/.../reschedule
      const mutatingCalls = calls.filter((c) => c.method !== 'GET');
      expect(mutatingCalls).toHaveLength(0);

      // Devolución del foco al botón original
      expect(document.activeElement).toBe(rescheduleBtn);
    });
  });

  describe('2. MatchScoresheetDialog', () => {
    it('cierra con Escape sin registrar resultados, atrapa el foco y lo devuelve al botón que lo abrió', async () => {
      const { calls } = mockApi({
        'GET /events/event-1/result': () =>
          json({
            event: EVENT_MOCK,
            result: null,
          }),
      });

      function Host() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button
              type="button"
              id="open-scoresheet"
              onClick={() => setOpen(true)}
            >
              Abrir acta
            </button>
            {open && (
              <MatchScoresheetDialog
                event={EVENT_MOCK}
                permissions={['results:manage']}
                onClose={() => setOpen(false)}
                onSaved={vi.fn()}
              />
            )}
          </div>
        );
      }

      render(<Host />);
      const openBtn = screen.getByRole('button', { name: 'Abrir acta' });
      openBtn.focus();
      await userEvent.click(openBtn);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      );
      expect(focusable.length).toBeGreaterThan(1);
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(document.activeElement).toBe(first);

      first.focus();
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      const mutatingCalls = calls.filter((c) => c.method !== 'GET');
      expect(mutatingCalls).toHaveLength(0);

      expect(document.activeElement).toBe(openBtn);
    });
  });

  describe('3. IncidentDialog', () => {
    it('cierra con Escape sin reportar incidencias, atrapa el foco y lo devuelve al botón que lo abrió', async () => {
      const { calls } = mockApi({});

      function Host() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button
              type="button"
              id="open-incident"
              onClick={() => setOpen(true)}
            >
              Reportar incidencia
            </button>
            {open && (
              <IncidentDialog
                eventId="event-1"
                title="Partido 1"
                clubs={[{ id: 'club-1', name: 'Club A' }]}
                canListAthletes={false}
                onClose={() => setOpen(false)}
                onReported={vi.fn()}
              />
            )}
          </div>
        );
      }

      render(<Host />);
      const openBtn = screen.getByRole('button', {
        name: 'Reportar incidencia',
      });
      openBtn.focus();
      await userEvent.click(openBtn);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      expect(focusable.length).toBeGreaterThan(1);
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(document.activeElement).toBe(first);

      first.focus();
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      const mutatingCalls = calls.filter((c) => c.method !== 'GET');
      expect(mutatingCalls).toHaveLength(0);

      expect(document.activeElement).toBe(openBtn);
    });
  });

  describe('4. EventAssignmentsDialog', () => {
    it('cierra con Escape sin modificar designaciones, atrapa el foco y lo devuelve al botón que lo abrió', async () => {
      const { calls } = mockApi({
        'GET /events/event-1/assignments': () => json([]),
        'GET /events/event-1/assignment-candidates': () => json([]),
      });

      function Host() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button
              type="button"
              id="open-assignments"
              onClick={() => setOpen(true)}
            >
              Designaciones
            </button>
            {open && (
              <EventAssignmentsDialog
                eventId="event-1"
                title="Partido 1"
                canManage={true}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        );
      }

      render(<Host />);
      const openBtn = screen.getByRole('button', { name: 'Designaciones' });
      openBtn.focus();
      await userEvent.click(openBtn);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      );
      expect(focusable.length).toBeGreaterThan(1);
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(document.activeElement).toBe(first);

      first.focus();
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      const mutatingCalls = calls.filter((c) => c.method !== 'GET');
      expect(mutatingCalls).toHaveLength(0);

      expect(document.activeElement).toBe(openBtn);
    });
  });

  describe('5. ComplaintDialog en DisciplinePage', () => {
    it('cierra con Escape sin añadir adjuntos ni resolver, atrapa el foco y lo devuelve al botón que lo abrió', async () => {
      const { calls } = mockApi({
        'GET /complaints/complaint-1': () =>
          json({
            id: 'complaint-1',
            subject: 'Reclamo de alineación',
            description: 'Jugó sin carné',
            status: 'recibido',
            submittedAt: '2026-06-01T10:00:00Z',
            club: { id: 'club-1', name: 'Club A' },
            championship: { id: 'champ-1', name: 'Campeonato 2026' },
            event: null,
            attachments: [],
          }),
      });

      function Host() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button
              type="button"
              id="open-complaint"
              onClick={() => setOpen(true)}
            >
              Ver reclamo
            </button>
            {open && (
              <ComplaintDialog
                complaintId="complaint-1"
                canAttach={true}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        );
      }

      render(<Host />);
      const openBtn = screen.getByRole('button', { name: 'Ver reclamo' });
      openBtn.focus();
      await userEvent.click(openBtn);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      );
      expect(focusable.length).toBeGreaterThan(1);
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(document.activeElement).toBe(first);

      first.focus();
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      const mutatingCalls = calls.filter((c) => c.method !== 'GET');
      expect(mutatingCalls).toHaveLength(0);

      expect(document.activeElement).toBe(openBtn);
    });
  });
});
