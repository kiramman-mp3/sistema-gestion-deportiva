import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { SecurityHashService } from '../auth/security-hash.service.js';
import { athleteCode } from '../athletes/athletes.service.js';
import { ClubAccessService } from '../clubs/club-access.service.js';
import { ENV, type Env } from '../config/config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { InstitutionService } from '../institution/institution.service.js';
import { PublicNamesService } from '../public/public-names.service.js';
import { StorageService } from '../storage/storage.service.js';
import { PdfService, type PdfWriter } from './pdf.service.js';

export type IssuedKind = 'carne' | 'certificado_inscripcion';

const PREFIX: Record<IssuedKind, string> = {
  carne: 'CAR',
  certificado_inscripcion: 'CER',
};
const TITLE: Record<IssuedKind, string> = {
  carne: 'Carné de deportista',
  certificado_inscripcion: 'Certificado de inscripción',
};

interface Snapshot {
  athleteName: string;
  athleteCode: string;
  clubName: string;
  teamName: string;
  categoryName: string;
  seasonName: string;
  jerseyNumber: number | null;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** 16 caracteres Base32 (80 bits): imposible de adivinar, fácil de dictar. */
function newVerificationCode(): string {
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => BASE32[b % 32]).join('');
}

export const documentLabel = (kind: IssuedKind, serial: number) =>
  `${PREFIX[kind]}-${String(serial).padStart(6, '0')}`;

const dateFmt = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'long',
  timeZone: 'America/Guayaquil',
});

const CARD_W = 242.6;
const CARD_H = 153;

@Injectable()
export class IssuedDocumentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hash: SecurityHashService,
    @Inject(PdfService) private readonly pdf: PdfService,
    @Inject(ClubAccessService) private readonly clubAccess: ClubAccessService,
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PublicNamesService) private readonly names: PublicNamesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private verifyUrl(code: string): string {
    return `${this.env.WEB_ORIGIN[0] ?? ''}/#/portal/verificar/${code}`;
  }

  private view(
    row: Prisma.IssuedDocumentGetPayload<{
      include: { season: { select: { name: true } } };
    }>,
  ) {
    return {
      id: row.id,
      kind: row.kind,
      label: documentLabel(row.kind, row.serial),
      version: row.version,
      season: row.season.name,
      verificationCode: row.verificationCode,
      issuedAt: row.issuedAt,
      revokedAt: row.revokedAt,
      revokeReason: row.revokeReason,
      valid: row.revokedAt === null,
    };
  }

  private async loadAthlete(athleteId: string, auth: AuthContext) {
    const athlete = await this.prisma.client.athlete.findUnique({
      where: { id: athleteId },
      include: { person: true, club: true, photo: { include: { file: true } } },
    });
    if (!athlete || !(await this.clubAccess.canAccess(auth, athlete.clubId))) {
      throw new NotFoundException('Deportista no encontrado');
    }
    return athlete;
  }

  // ───────────────────── Emisión ─────────────────────

  async issue(
    athleteId: string,
    kind: IssuedKind,
    seasonId: string | undefined,
    auth: AuthContext,
    ip: string,
  ) {
    const athlete = await this.loadAthlete(athleteId, auth);
    if (
      athlete.person.status !== 'activo' ||
      athlete.eligibility !== 'habilitado'
    ) {
      throw new ConflictException(
        'Solo se emiten documentos a deportistas activos y habilitados',
      );
    }
    return this.prisma.client.$transaction(async (tx) => {
      const season = await this.resolveSeason(tx, seasonId);
      const membership = await tx.teamMembership.findFirst({
        where: { athleteId, seasonId: season.id, status: 'activo' },
        include: { teamSeason: { include: { category: true } } },
      });
      if (!membership) {
        throw new ConflictException(
          'El deportista no está en la plantilla de ningún equipo en esa temporada',
        );
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`issued:${athleteId}:${kind}`}))`;

      const previous = await tx.issuedDocument.findFirst({
        where: { athleteId, seasonId: season.id, kind },
        orderBy: { version: 'desc' },
      });
      if (previous && previous.revokedAt === null) {
        await tx.issuedDocument.update({
          where: { id: previous.id },
          data: {
            revokedAt: new Date(),
            revokedById: auth.user.id,
            revokeReason: 'Reemplazado por una versión más reciente',
          },
        });
      }
      const snapshot: Snapshot = {
        athleteName: `${athlete.person.firstName} ${athlete.person.lastName}`,
        athleteCode: athleteCode(athlete.codeNumber),
        clubName: athlete.club.name,
        teamName: membership.teamSeason.name,
        categoryName: membership.teamSeason.category.name,
        seasonName: season.name,
        jerseyNumber: membership.jerseyNumber,
      };
      const created = await tx.issuedDocument.create({
        data: {
          kind,
          athleteId,
          seasonId: season.id,
          version: (previous?.version ?? 0) + 1,
          verificationCode: newVerificationCode(),
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          issuedById: auth.user.id,
        },
        include: { season: { select: { name: true } } },
      });
      await this.audit.record(
        {
          action: 'document.issued',
          entityType: 'athlete',
          entityId: athleteId,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: {
            kind,
            label: documentLabel(kind, created.serial),
            version: created.version,
            seasonId: season.id,
          },
        },
        tx,
      );
      return this.view(created);
    });
  }

  /** La temporada indicada o, si no se indica, la única temporada activa. */
  private async resolveSeason(tx: Prisma.TransactionClient, seasonId?: string) {
    if (seasonId) {
      const season = await tx.season.findUnique({ where: { id: seasonId } });
      if (!season) throw new NotFoundException('Temporada no encontrada');
      return season;
    }
    const active = await tx.season.findMany({
      where: { status: 'activa' },
      take: 2,
    });
    if (active.length !== 1) {
      throw new ConflictException(
        active.length === 0
          ? 'No hay una temporada activa: indique la temporada'
          : 'Hay varias temporadas activas: indique la temporada',
      );
    }
    return active[0]!;
  }

  async list(athleteId: string, auth: AuthContext) {
    await this.loadAthlete(athleteId, auth);
    const rows = await this.prisma.client.issuedDocument.findMany({
      where: { athleteId },
      include: { season: { select: { name: true } } },
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((r) => this.view(r));
  }

  async revoke(id: string, reason: string, auth: AuthContext, ip: string) {
    const doc = await this.prisma.client.issuedDocument.findUnique({
      where: { id },
      include: {
        athlete: { select: { clubId: true } },
        season: { select: { name: true } },
      },
    });
    if (!doc || !(await this.clubAccess.canAccess(auth, doc.athlete.clubId))) {
      throw new NotFoundException('Documento no encontrado');
    }
    if (doc.revokedAt)
      throw new ConflictException('El documento ya está anulado');
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.issuedDocument.update({
        where: { id },
        data: {
          revokedAt: new Date(),
          revokedById: auth.user.id,
          revokeReason: reason,
        },
        include: { season: { select: { name: true } } },
      });
      await this.audit.record(
        {
          action: 'document.revoked',
          entityType: 'athlete',
          entityId: doc.athleteId,
          userId: auth.user.id,
          ipHash: this.hash.hash('ip', ip),
          after: {
            label: documentLabel(doc.kind, doc.serial),
            version: doc.version,
          },
          reason,
        },
        tx,
      );
      return this.view(updated);
    });
  }

  // ───────────────────── Verificación pública ─────────────────────

  /**
   * Quien recibe un documento comprueba aquí que existe y sigue vigente. Se revela lo mínimo: tipo,
   * número, temporada, club y titular (por nombre solo si es adulto o tiene consentimiento; si no,
   * por su código).
   */
  async verify(code: string) {
    const doc = await this.prisma.client.issuedDocument.findUnique({
      where: { verificationCode: code },
      include: { season: { select: { name: true } } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    const snapshot = doc.snapshot as unknown as Snapshot;
    const holder = (await this.names.labels([doc.athleteId])).get(
      doc.athleteId,
    );
    return {
      valid: doc.revokedAt === null,
      kind: doc.kind,
      label: documentLabel(doc.kind, doc.serial),
      version: doc.version,
      season: doc.season.name,
      issuedAt: doc.issuedAt,
      revokedAt: doc.revokedAt,
      holder: holder ?? snapshot.athleteCode,
      club: snapshot.clubName,
    };
  }

  // ───────────────────── Descarga ─────────────────────

  async renderOne(id: string, auth: AuthContext, ip: string) {
    const doc = await this.prisma.client.issuedDocument.findUnique({
      where: { id },
      include: { athlete: { include: { photo: { include: { file: true } } } } },
    });
    if (!doc || !(await this.clubAccess.canAccess(auth, doc.athlete.clubId))) {
      throw new NotFoundException('Documento no encontrado');
    }
    if (doc.revokedAt) throw new ConflictException('El documento fue anulado');
    const label = documentLabel(doc.kind, doc.serial);
    const writer = await this.pdf.create({
      title: TITLE[doc.kind],
      code: label,
      version: doc.version,
      now: doc.issuedAt,
    });
    const snapshot = doc.snapshot as unknown as Snapshot;
    if (doc.kind === 'carne') {
      writer.heading('CARNÉ DE DEPORTISTA');
      const photo = await this.photoOf(doc.athlete.photo?.file);
      await this.drawCard(
        writer,
        MARGIN_X(writer),
        writer.doc.y,
        snapshot,
        doc,
        label,
        photo,
      );
      writer.doc.y += CARD_H + 16;
      writer.paragraph(
        'Recorte por el borde. Tamaño de tarjeta 85,6 × 54 mm. Verifique su autenticidad escaneando el código QR.',
        { size: 8, muted: true },
      );
    } else {
      await this.certificate(writer, snapshot, doc, label);
    }
    await this.audit.record({
      action: 'document.downloaded',
      entityType: 'athlete',
      entityId: doc.athleteId,
      userId: auth.user.id,
      ipHash: this.hash.hash('ip', ip),
      after: { label, version: doc.version },
    });
    return {
      buffer: await writer.finish(),
      mimeType: 'application/pdf',
      filename: `${label.toLowerCase()}.pdf`,
    };
  }

  /** Hoja de carnés de toda la plantilla de un equipo; emite los que falten. */
  async teamSheet(teamSeasonId: string, auth: AuthContext, ip: string) {
    const teamSeason = await this.prisma.client.teamSeason.findUnique({
      where: { id: teamSeasonId },
      include: {
        team: true,
        season: true,
        category: true,
        memberships: {
          where: {
            status: 'activo',
            athlete: {
              eligibility: 'habilitado',
              person: { status: 'activo' },
            },
          },
          include: {
            athlete: {
              include: {
                person: true,
                club: true,
                photo: { include: { file: true } },
              },
            },
          },
          orderBy: [{ jerseyNumber: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (
      !teamSeason ||
      !(await this.clubAccess.canAccess(auth, teamSeason.team.clubId))
    ) {
      throw new NotFoundException('Equipo no encontrado');
    }
    const writer = await this.pdf.create({
      title: `Carnés de ${teamSeason.name}`,
    });
    writer.heading(`CARNÉS: ${teamSeason.name.toUpperCase()}`);
    writer.paragraph(
      `Temporada ${teamSeason.season.name} · ${teamSeason.category.name}. Recorte por el borde de cada tarjeta.`,
      { size: 9, muted: true },
    );
    if (teamSeason.memberships.length === 0) {
      writer.paragraph('No hay deportistas habilitados en la plantilla.');
    }
    const issued: string[] = [];
    let slot = 0;
    const perPage = 8;
    for (const membership of teamSeason.memberships) {
      const existing = await this.prisma.client.issuedDocument.findFirst({
        where: {
          athleteId: membership.athleteId,
          seasonId: teamSeason.seasonId,
          kind: 'carne',
          revokedAt: null,
        },
        orderBy: { version: 'desc' },
      });
      const doc =
        existing ??
        (await this.issueRaw(
          membership.athleteId,
          teamSeason.seasonId,
          auth,
          ip,
        ));
      issued.push(documentLabel('carne', doc.serial));
      if (slot > 0 && slot % perPage === 0) {
        writer.doc.addPage();
        writer.doc.y = 60;
      }
      const col = slot % 2;
      const row = Math.floor((slot % perPage) / 2);
      const x = 48 + col * (CARD_W + 20);
      const y = (slot < perPage ? writer.doc.y + 4 : 60) + row * (CARD_H + 10);
      const photo = await this.photoOf(membership.athlete.photo?.file);
      await this.drawCard(
        writer,
        x,
        y,
        {
          athleteName: `${membership.athlete.person.firstName} ${membership.athlete.person.lastName}`,
          athleteCode: athleteCode(membership.athlete.codeNumber),
          clubName: membership.athlete.club.name,
          teamName: teamSeason.name,
          categoryName: teamSeason.category.name,
          seasonName: teamSeason.season.name,
          jerseyNumber: membership.jerseyNumber,
        },
        doc,
        documentLabel('carne', doc.serial),
        photo,
      );
      slot++;
    }
    await this.audit.record({
      action: 'document.downloaded',
      entityType: 'team_season',
      entityId: teamSeasonId,
      userId: auth.user.id,
      ipHash: this.hash.hash('ip', ip),
      after: { kind: 'carnes_equipo', cards: issued.length },
    });
    return {
      buffer: await writer.finish(),
      mimeType: 'application/pdf',
      filename: `carnes-${teamSeason.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
    };
  }

  /** Emisión de un carné dentro de la hoja de equipo (hereda el alcance ya comprobado). */
  private async issueRaw(
    athleteId: string,
    seasonId: string,
    auth: AuthContext,
    ip: string,
  ) {
    const view = await this.issue(athleteId, 'carne', seasonId, auth, ip);
    return this.prisma.client.issuedDocument.findUniqueOrThrow({
      where: { id: view.id },
    });
  }

  // ───────────────────── Dibujo ─────────────────────

  private async photoOf(file?: { filename: string; mimeType: string } | null) {
    if (!file || !/^image\/(png|jpeg)$/.test(file.mimeType)) return null;
    try {
      return await this.storage.readFile(file.filename);
    } catch {
      return null;
    }
  }

  private async drawCard(
    writer: PdfWriter,
    x: number,
    y: number,
    s: Snapshot,
    doc: { verificationCode: string; version: number },
    label: string,
    photo: Buffer | null,
  ) {
    const d = writer.doc;
    const info = await this.institution.get();
    d.save();
    d.roundedRect(x, y, CARD_W, CARD_H, 6)
      .lineWidth(0.8)
      .strokeColor('#0b3d6e')
      .stroke();
    d.rect(x, y, CARD_W, 24).fill('#0b3d6e');
    d.fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text((info.shortName ?? info.name).toUpperCase(), x + 8, y + 5, {
        width: CARD_W - 16,
        lineBreak: false,
      });
    d.font('Helvetica')
      .fontSize(6.5)
      .text('CARNÉ DE DEPORTISTA', x + 8, y + 15, {
        width: CARD_W - 16,
        lineBreak: false,
      });
    d.rect(x + 8, y + 32, 52, 66)
      .lineWidth(0.5)
      .strokeColor('#8a96a3')
      .stroke();
    if (photo) {
      try {
        d.image(photo, x + 8, y + 32, {
          fit: [52, 66],
          align: 'center',
          valign: 'center',
        });
      } catch {
        // Fotografía ilegible: se deja el recuadro vacío.
      }
    }
    d.fillColor('black')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(s.athleteName, x + 68, y + 32, {
        width: CARD_W - 76,
        height: 24,
      });
    d.font('Helvetica').fontSize(7.5).fillColor('#222');
    const lines = [
      `Código: ${s.athleteCode}`,
      `Club: ${s.clubName}`,
      `Equipo: ${s.teamName}${s.jerseyNumber !== null ? ` · N.º ${s.jerseyNumber}` : ''}`,
      `Categoría: ${s.categoryName}`,
      `Temporada: ${s.seasonName}`,
    ];
    let ty = y + 58;
    for (const line of lines) {
      d.text(line, x + 68, ty, {
        width: CARD_W - 76 - 52,
        height: 10,
        ellipsis: true,
      });
      ty += 10;
    }
    writer.qr(
      this.verifyUrl(doc.verificationCode),
      x + CARD_W - 58,
      y + CARD_H - 62,
      52,
    );
    d.fillColor('#4a5560')
      .font('Helvetica')
      .fontSize(5.5)
      .text(
        `${label} · v${doc.version} · Verificación: ${doc.verificationCode}`,
        x + 8,
        y + CARD_H - 12,
        { width: CARD_W - 70, lineBreak: false },
      );
    d.restore();
  }

  private async certificate(
    writer: PdfWriter,
    s: Snapshot,
    doc: { verificationCode: string; issuedAt: Date; version: number },
    label: string,
  ) {
    const info = await this.institution.documentHeader();
    writer.heading('CERTIFICADO DE INSCRIPCIÓN');
    writer.paragraph(
      `La ${info.institution === info.institution.toUpperCase() ? 'Liga' : 'Liga'} certifica que ${s.athleteName} (${s.athleteCode}), perteneciente al club ${s.clubName}, se encuentra inscrito/a y registrado/a en la plantilla del equipo ${s.teamName}, categoría ${s.categoryName}, para la temporada ${s.seasonName}.`,
      { size: 11 },
    );
    writer.paragraph(
      'Este certificado se extiende a solicitud del interesado para los fines que estime convenientes. Su autenticidad puede comprobarse en el portal de la Liga con el código indicado.',
      { size: 10 },
    );
    writer.paragraph(`Quero, ${dateFmt.format(doc.issuedAt)}.`, { size: 10 });
    writer.signatures([
      info.presidentName
        ? `${info.presidentName}\nPresidente de la Liga`
        : 'Presidente de la Liga',
      info.secretaryName
        ? `${info.secretaryName}\nSecretario/a de la Liga`
        : 'Secretario/a de la Liga',
    ]);
    const y = writer.doc.y + 10;
    writer.qr(this.verifyUrl(doc.verificationCode), 48, y, 80);
    writer.doc
      .fillColor('#4a5560')
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Documento ${label} · versión ${doc.version}\nCódigo de verificación: ${doc.verificationCode}\n${this.verifyUrl(doc.verificationCode)}`,
        140,
        y + 8,
        { width: 380 },
      );
  }
}

const MARGIN_X = (writer: PdfWriter) => (writer.doc.page.width - CARD_W) / 2;
