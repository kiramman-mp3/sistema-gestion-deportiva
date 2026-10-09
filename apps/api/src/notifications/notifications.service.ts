import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import type { Page } from '../catalogs/common.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import { ENV, type Env } from '../config/config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { InstitutionService } from '../institution/institution.service.js';
import type {
  Notification,
  NotificationStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { MAIL_TRANSPORTER, type MailTransporter } from './mail.js';
import {
  renderTemplate,
  type TemplateKey,
  type TemplateParams,
} from './notification-templates.js';

const DATE_TIME = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guayaquil',
});

/** Fecha y hora en la zona horaria de Ecuador, para los textos de los avisos. */
export function formatLocalDateTime(date: Date): string {
  return DATE_TIME.format(date);
}

/** Intentos máximos de envío de un correo antes de darlo por fallido. */
export const MAX_MAIL_ATTEMPTS = 5;
/** Arrendamiento de un correo reclamado: si el proceso cae a mitad del envío, se reintenta después. */
const LEASE_MINUTES = 5;
/** Espera tras un fallo: crece con cada intento (5, 10, 15… minutos). */
const BACKOFF_MINUTES = 5;

export interface NotifyInput<K extends TemplateKey> {
  /** Destinatarios; se descartan duplicados y cuentas que no estén activas. */
  userIds: readonly string[];
  template: K;
  params: TemplateParams[K];
  entityType?: string;
  entityId?: string;
  /** Ruta interna de la interfaz (`#/campeonatos/<id>`). */
  link?: string;
  /** Quien originó la acción: no se notifica a sí mismo. */
  excludeUserId?: string;
}

export interface DispatchSummary {
  sent: number;
  failed: number;
  retrying: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(ClubAccessService) private readonly clubAccess: ClubAccessService,
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_TRANSPORTER)
    private readonly mail: MailTransporter | null,
  ) {}

  get mailEnabled(): boolean {
    return this.mail !== null;
  }

  // ───────────────────── Destinatarios ─────────────────────

  /** Usuarios activos vinculados a alguno de los clubes (dirigentes, entrenadores…). */
  async clubUserIds(
    tx: Prisma.TransactionClient,
    clubIds: readonly string[],
  ): Promise<string[]> {
    if (clubIds.length === 0) return [];
    const links = await tx.clubUser.findMany({
      where: { clubId: { in: [...clubIds] }, user: { status: 'activo' } },
      select: { userId: true },
    });
    return [...new Set(links.map((l) => l.userId))];
  }

  /** Usuarios activos que tienen el permiso indicado a través de alguno de sus roles. */
  async permissionUserIds(
    tx: Prisma.TransactionClient,
    permission: string,
  ): Promise<string[]> {
    const users = await tx.user.findMany({
      where: {
        status: 'activo',
        roles: {
          some: {
            role: {
              permissions: { some: { permission: { code: permission } } },
            },
          },
        },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  // ───────────────────── Creación ─────────────────────

  /**
   * Crea el aviso del sistema (y, si el correo está activado, el correo pendiente) para
   * cada destinatario. Se invoca con la transacción de la operación que lo origina: si esa
   * operación se revierte, las notificaciones también.
   */
  async notify<K extends TemplateKey>(
    tx: Prisma.TransactionClient,
    input: NotifyInput<K>,
  ): Promise<number> {
    const wanted = [...new Set(input.userIds)].filter(
      (id) => id !== input.excludeUserId,
    );
    if (wanted.length === 0) return 0;
    const recipients = await tx.user.findMany({
      where: { id: { in: wanted }, status: 'activo' },
      select: { id: true },
    });
    if (recipients.length === 0) return 0;

    const { title, body } = renderTemplate(input.template, input.params);
    const common = {
      templateKey: input.template,
      title,
      body,
      entityType: input.entityType,
      entityId: input.entityId,
      link: input.link,
    };
    const now = new Date();
    await tx.notification.createMany({
      data: recipients.flatMap(({ id }) => [
        {
          ...common,
          userId: id,
          channel: 'sistema' as const,
          status: 'enviada' as const,
          sentAt: now,
        },
        ...(this.mailEnabled
          ? [{ ...common, userId: id, channel: 'correo' as const }]
          : []),
      ]),
    });
    return recipients.length;
  }

  // ───────────────────── Contexto de un partido ─────────────────────

  /**
   * Datos para redactar y dirigir un aviso sobre un partido: nombre de los participantes,
   * campeonato, fecha en hora de Ecuador y usuarios de los clubes involucrados.
   */
  async eventContext(
    tx: Prisma.TransactionClient,
    eventId: string,
  ): Promise<{
    championship: string;
    match: string;
    when: string | null;
    clubIds: string[];
    audience: string[];
  }> {
    const event = await tx.event.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        round: { include: { stage: { include: { championship: true } } } },
        participants: {
          include: {
            registration: {
              include: {
                participant: {
                  include: {
                    team: { include: { team: true } },
                    individual: {
                      include: { athlete: { include: { person: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const names: string[] = [];
    const clubIds = new Set<string>();
    for (const ep of event.participants) {
      const p = ep.registration.participant;
      if (p.team) {
        names.push(p.team.team.name);
        clubIds.add(p.team.team.clubId);
      } else if (p.individual) {
        const { person, clubId } = p.individual.athlete;
        names.push(`${person.firstName} ${person.lastName}`);
        clubIds.add(clubId);
      }
    }
    return {
      championship: event.round.stage.championship.name,
      match: names.length > 0 ? names.join(' vs ') : 'Partido por definir',
      when: event.scheduledAt ? formatLocalDateTime(event.scheduledAt) : null,
      clubIds: [...clubIds],
      audience: await this.clubUserIds(tx, [...clubIds]),
    };
  }

  // ───────────────────── Bandeja del usuario ─────────────────────

  async listForUser(
    userId: string,
    query: { page: number; pageSize: number; unread: boolean },
  ): Promise<Page<Notification>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: 'sistema',
      ...(query.unread && { readAt: null }),
    };
    const [total, items] = await Promise.all([
      this.prisma.client.notification.count({ where }),
      this.prisma.client.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    const unread = await this.prisma.client.notification.count({
      where: { userId, channel: 'sistema', readAt: null },
    });
    return { unread };
  }

  async markRead(userId: string, id: string): Promise<void> {
    // Solo las propias: una ajena responde como inexistente.
    const result = await this.prisma.client.notification.updateMany({
      where: { id, userId, channel: 'sistema', readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.client.notification.findFirst({
        where: { id, userId, channel: 'sistema' },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Notificación no encontrada');
    }
  }

  async markAllRead(userId: string): Promise<{ marked: number }> {
    const result = await this.prisma.client.notification.updateMany({
      where: { userId, channel: 'sistema', readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: result.count };
  }

  // ───────────────────── Correo ─────────────────────

  async outbox(query: {
    page: number;
    pageSize: number;
    status?: NotificationStatus;
  }) {
    const where: Prisma.NotificationWhereInput = {
      channel: 'correo',
      ...(query.status && { status: query.status }),
    };
    const [total, items] = await Promise.all([
      this.prisma.client.notification.count({ where }),
      this.prisma.client.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          templateKey: true,
          title: true,
          status: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          sentAt: true,
          user: { select: { id: true, displayName: true } },
        },
      }),
    ]);
    return {
      mailEnabled: this.mailEnabled,
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /**
   * Envía los correos pendientes. Reclama las filas con `FOR UPDATE SKIP LOCKED`, de modo que
   * dos despachadores simultáneos (o dos instancias de la API) nunca envían el mismo correo.
   * El mensaje solo lleva el título genérico y un enlace al sistema.
   */
  async dispatchPending(limit = 50): Promise<DispatchSummary> {
    const summary: DispatchSummary = { sent: 0, failed: 0, retrying: 0 };
    const mail = this.mail;
    if (!mail) return summary;

    const claimed = await this.prisma.client.$queryRaw<{ id: string }[]>`
      UPDATE notifications
      SET attempts = attempts + 1,
          next_attempt_at = now() + make_interval(mins => ${LEASE_MINUTES})
      WHERE id IN (
        SELECT id FROM notifications
        WHERE channel = 'correo' AND status = 'pendiente'
          AND attempts < ${MAX_MAIL_ATTEMPTS}
          AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    if (claimed.length === 0) return summary;

    const rows = await this.prisma.client.notification.findMany({
      where: { id: { in: claimed.map((c) => c.id) } },
      include: { user: { select: { email: true } } },
    });
    const institution = await this.institution.get();
    const sender = institution.shortName ?? institution.name;
    const origin = this.env.WEB_ORIGIN[0] ?? '';

    for (const row of rows) {
      try {
        await mail.sendMail({
          from: this.env.MAIL_FROM ?? '',
          to: row.user.email,
          subject: `${sender}: ${row.title}`,
          text: [
            row.title,
            '',
            `Ingrese al sistema para ver el detalle: ${origin}/${row.link ?? ''}`,
            '',
            'Este mensaje es automático. No incluye datos del caso por seguridad.',
          ].join('\n'),
        });
        await this.prisma.client.notification.update({
          where: { id: row.id },
          data: { status: 'enviada', sentAt: new Date(), lastError: null },
        });
        summary.sent++;
      } catch (error) {
        // Solo el código del error: el mensaje podría contener direcciones o credenciales.
        const code =
          (error as { code?: unknown }).code?.toString().slice(0, 40) ??
          'ERROR_DE_ENVIO';
        const exhausted = row.attempts >= MAX_MAIL_ATTEMPTS;
        await this.prisma.client.notification.update({
          where: { id: row.id },
          data: {
            status: exhausted ? 'fallida' : 'pendiente',
            lastError: code,
            nextAttemptAt: new Date(
              Date.now() + row.attempts * BACKOFF_MINUTES * 60_000,
            ),
          },
        });
        this.logger.warn(`No se pudo enviar el correo ${row.id}: ${code}`);
        if (exhausted) summary.failed++;
        else summary.retrying++;
      }
    }
    return summary;
  }

  // ───────────────────── Recordatorios ─────────────────────

  /**
   * Recordatorio de documentación: avisa a los usuarios del club cuántos deportistas no tienen
   * ningún documento de inscripción. El aviso lleva solo la cantidad, nunca nombres.
   */
  async remindDocuments(
    auth: AuthContext,
    ip: string,
    clubId: string,
  ): Promise<{ pending: number; notified: number }> {
    await this.clubAccess.assertAccess(auth, clubId);
    const club = await this.prisma.client.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');

    return this.prisma.client.$transaction(async (tx) => {
      const pending = await tx.athlete.count({
        where: {
          clubId,
          eligibility: { not: 'inhabilitado' },
          person: { status: 'activo' },
          documents: { none: {} },
        },
      });
      let notified = 0;
      if (pending > 0) {
        notified = await this.notify(tx, {
          userIds: await this.clubUserIds(tx, [clubId]),
          template: 'documents.reminder',
          params: { club: club.name, pending },
          entityType: 'club',
          entityId: clubId,
          link: '#/deportistas',
          excludeUserId: auth.user.id,
        });
      }
      await this.audit.record(
        {
          action: 'notifications.documents_reminder',
          entityType: 'club',
          entityId: clubId,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: { pending, notified },
        },
        tx,
      );
      return { pending, notified };
    });
  }
}
