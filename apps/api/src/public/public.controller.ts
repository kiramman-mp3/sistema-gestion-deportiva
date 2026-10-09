import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AthletesService } from '../athletes/athletes.service.js';
import { Public } from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { listQuerySchema } from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';
import { DocumentsService } from '../documents/documents.service.js';

/**
 * Información PÚBLICA, sin sesión. Solo expone campos aprobados para publicación:
 * jamás datos de contacto, documentos, fechas de nacimiento ni datos de menores
 * sin consentimiento. Cada ruta nueva aquí debe revisarse con esa regla.
 */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AthletesService) private readonly athletes: AthletesService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}

  /** Clubes activos: nombre, nombre corto, identificador y sector. */
  @Get('clubs')
  async clubs(@Query() query: unknown) {
    const { page, pageSize } = parseOrThrow(listQuerySchema, query);
    const where = { status: 'activo' as const };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.club.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { name: true, shortName: true, slug: true, sector: true },
      }),
      this.prisma.client.club.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  @Get('clubs/:slug')
  async club(@Param('slug') slug: string) {
    const club = await this.prisma.client.club.findFirst({
      where: { slug, status: 'activo' },
      select: { name: true, shortName: true, slug: true, sector: true },
    });
    if (!club) throw new NotFoundException('Club no encontrado');
    return club;
  }

  /**
   * Perfil resumido de un deportista: solo nombre para mostrar y club, y únicamente si
   * está publicado con consentimiento vigente. Sin indexación en buscadores.
   */
  @Get('athletes/:id')
  async athlete(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return this.athletes.publicProfile(parseOrThrow(uuidSchema, id));
  }

  /**
   * Fotografía pública de un deportista: solo si el perfil está publicado y
   * existe consentimiento vigente de publicación de fotografía.
   */
  @Get('athletes/:id/photo')
  async athletePhoto(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    const result = await this.documents.getPublicPhoto(athleteId);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.buffer);
  }
}

