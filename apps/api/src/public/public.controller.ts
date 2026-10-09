import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators.js';
import { parseOrThrow } from '../auth/schemas.js';
import { listQuerySchema } from '../catalogs/common.js';
import { PrismaService } from '../database/prisma.service.js';

/**
 * Información PÚBLICA, sin sesión. Solo expone campos aprobados para publicación:
 * jamás datos de contacto, documentos, fechas de nacimiento ni datos de menores
 * sin consentimiento. Cada ruta nueva aquí debe revisarse con esa regla.
 */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
}
