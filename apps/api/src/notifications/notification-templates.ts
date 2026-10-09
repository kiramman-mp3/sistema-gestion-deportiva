/**
 * Plantillas de notificación. El `title` es genérico y NO contiene datos de personas ni del
 * caso: es lo único que viaja por correo (§5.14: nada sensible en asuntos ni en mensajes
 * reenviables). El `body` puede incluir el detalle y solo se muestra dentro del sistema.
 */
export interface TemplateParams {
  'registration.reviewed': {
    participant: string;
    championship: string;
    status: string;
    notes?: string | null;
  };
  'event.rescheduled': {
    championship: string;
    match: string;
    when: string | null;
    reason?: string | null;
  };
  'event.status_changed': {
    championship: string;
    match: string;
    status: string;
    reason?: string | null;
  };
  'assignment.created': { match: string; role: string; when: string | null };
  'assignment.removed': { match: string; role: string };
  'assignment.rejected': { official: string; match: string; role: string };
  'result.pending_review': { championship: string; match: string };
  'case.assigned': { number: string; subject: string };
  'complaint.received': { club: string | null; subject: string };
  'resolution.published': { title: string };
  'documents.reminder': { club: string; pending: number };
}

export type TemplateKey = keyof TemplateParams;

interface Rendered {
  title: string;
  body: string;
}

const REGISTRATION_STATUS: Record<string, string> = {
  observada: 'observada',
  aprobada: 'aprobada',
  rechazada: 'rechazada',
  retirada: 'retirada',
  pendiente: 'pendiente de revisión',
};

const EVENT_STATUS: Record<string, string> = {
  suspendido: 'suspendido',
  postergado: 'postergado',
  cancelado: 'cancelado',
  programado: 'programado',
  en_curso: 'en curso',
  finalizado: 'finalizado',
};

const withReason = (text: string, reason?: string | null) =>
  reason ? `${text} Motivo: ${reason}.` : text;

const RENDERERS: { [K in TemplateKey]: (p: TemplateParams[K]) => Rendered } = {
  'registration.reviewed': (p) => ({
    title: 'Cambió el estado de una inscripción',
    body: withReason(
      `La inscripción de ${p.participant} en «${p.championship}» quedó ${REGISTRATION_STATUS[p.status] ?? p.status}.`,
      p.notes,
    ),
  }),
  'event.rescheduled': (p) => ({
    title: 'Se modificó la programación de un partido',
    body: withReason(
      `${p.match} («${p.championship}») ${p.when ? `se reprogramó para ${p.when}` : 'quedó sin fecha definida'}.`,
      p.reason,
    ),
  }),
  'event.status_changed': (p) => ({
    title: 'Cambió el estado de un partido',
    body: withReason(
      `${p.match} («${p.championship}») ahora está ${EVENT_STATUS[p.status] ?? p.status}.`,
      p.reason,
    ),
  }),
  'assignment.created': (p) => ({
    title: 'Tiene una nueva designación',
    body: `Fue designado/a como ${p.role} en ${p.match}${p.when ? ` (${p.when})` : ''}.`,
  }),
  'assignment.removed': (p) => ({
    title: 'Se retiró una designación',
    body: `Ya no está designado/a como ${p.role} en ${p.match}.`,
  }),
  'assignment.rejected': (p) => ({
    title: 'Un oficial rechazó una designación',
    body: `${p.official} rechazó su designación como ${p.role} en ${p.match}. Hace falta un reemplazo.`,
  }),
  'result.pending_review': (p) => ({
    title: 'Hay un resultado pendiente de revisión',
    body: `El acta de ${p.match} («${p.championship}») espera su revisión.`,
  }),
  'case.assigned': (p) => ({
    title: 'Se le asignó un expediente',
    body: `Expediente ${p.number}: ${p.subject}.`,
  }),
  'complaint.received': (p) => ({
    title: 'Se recibió un reclamo',
    body: `Nuevo reclamo${p.club ? ` del club ${p.club}` : ''}: ${p.subject}.`,
  }),
  'resolution.published': (p) => ({
    title: 'Se publicó una resolución',
    body: `Se publicó la resolución «${p.title}».`,
  }),
  'documents.reminder': (p) => ({
    title: 'Recordatorio de documentación',
    body: `${p.pending} deportista(s) del club ${p.club} tienen documentación de inscripción pendiente.`,
  }),
};

export function renderTemplate<K extends TemplateKey>(
  key: K,
  params: TemplateParams[K],
): Rendered {
  return RENDERERS[key](params);
}
