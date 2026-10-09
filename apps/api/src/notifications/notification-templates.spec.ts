import { renderTemplate } from './notification-templates.js';

describe('plantillas de notificación', () => {
  it('el título es genérico: nunca contiene datos de personas ni del caso', () => {
    const secrets = {
      participant: 'Juan Pérez',
      championship: 'Torneo Secreto',
      match: 'Los Cóndores vs Las Águilas',
      reason: 'Motivo privado',
      notes: 'Nota privada',
      club: 'Club Reservado',
      subject: 'Asunto reservado',
      title: 'Título reservado',
      number: 'EXP-2026-000001',
      role: 'Árbitro central',
    };
    const rendered = [
      renderTemplate('registration.reviewed', {
        participant: secrets.participant,
        championship: secrets.championship,
        status: 'observada',
        notes: secrets.notes,
      }),
      renderTemplate('event.rescheduled', {
        championship: secrets.championship,
        match: secrets.match,
        when: '25 jun 2026, 10:00',
        reason: secrets.reason,
      }),
      renderTemplate('event.status_changed', {
        championship: secrets.championship,
        match: secrets.match,
        status: 'suspendido',
        reason: secrets.reason,
      }),
      renderTemplate('assignment.created', {
        match: secrets.match,
        role: secrets.role,
        when: null,
      }),
      renderTemplate('assignment.removed', {
        match: secrets.match,
        role: secrets.role,
      }),
      renderTemplate('result.pending_review', {
        championship: secrets.championship,
        match: secrets.match,
      }),
      renderTemplate('case.assigned', {
        number: secrets.number,
        subject: secrets.subject,
      }),
      renderTemplate('complaint.received', {
        club: secrets.club,
        subject: secrets.subject,
      }),
      renderTemplate('resolution.published', { title: secrets.title }),
      renderTemplate('documents.reminder', { club: secrets.club, pending: 3 }),
    ];
    for (const { title, body } of rendered) {
      expect(title.length).toBeGreaterThan(5);
      for (const secret of Object.values(secrets)) {
        expect(title, `título «${title}»`).not.toContain(secret);
      }
      expect(body.length).toBeGreaterThan(title.length);
    }
  });

  it('el detalle sí aparece en el cuerpo, con el motivo cuando lo hay', () => {
    const { body } = renderTemplate('event.rescheduled', {
      championship: 'Torneo',
      match: 'A vs B',
      when: '25 jun 2026, 10:00',
      reason: 'Lluvia',
    });
    expect(body).toContain('A vs B');
    expect(body).toContain('25 jun 2026, 10:00');
    expect(body).toContain('Motivo: Lluvia.');
    expect(
      renderTemplate('event.rescheduled', {
        championship: 'T',
        match: 'A vs B',
        when: null,
      }).body,
    ).toContain('sin fecha definida');
  });
});
