import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthContext, AuthedRequest } from '../auth/auth.types.js';
import {
  AllowMultipart,
  CurrentAuth,
  Public,
  RequirePermissions,
} from '../auth/decorators.js';
import { parseOrThrow } from '../auth/schemas.js';
import type { UploadFilePayload } from '../documents/documents.schemas.js';
import { updateInstitutionSchema } from './institution.schemas.js';
import { InstitutionService } from './institution.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

const withImageFlags = <
  T extends { logoFileId: string | null; coverFileId: string | null },
>(
  row: T,
) => ({
  ...row,
  hasLogo: row.logoFileId !== null,
  hasCover: row.coverFileId !== null,
});

/** Envía una imagen pública con cabeceras seguras y caché corta. */
function sendImage(res: Response, image: { buffer: Buffer; mimeType: string }) {
  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(image.buffer);
}

@ApiTags('institution')
@Controller('institution')
export class InstitutionController {
  constructor(
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
  ) {}

  @RequirePermissions('institution:read')
  @Get()
  async get() {
    const row = await this.institution.get();
    return withImageFlags(row);
  }

  @RequirePermissions('institution:manage')
  @Patch()
  async update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const row = await this.institution.update(
      auth,
      ipOf(req),
      parseOrThrow(updateInstitutionSchema, body),
    );
    return withImageFlags(row);
  }

  @RequirePermissions('institution:manage')
  @AllowMultipart()
  @UseInterceptors(FileInterceptor('file'))
  @Put('logo')
  async setLogo(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadFilePayload | undefined,
  ) {
    await this.institution.setLogo(auth, ipOf(req), file);
    return { success: true };
  }

  @RequirePermissions('institution:manage')
  @Delete('logo')
  @HttpCode(204)
  async removeLogo(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.institution.removeLogo(auth, ipOf(req));
  }

  @RequirePermissions('institution:manage')
  @AllowMultipart()
  @UseInterceptors(FileInterceptor('file'))
  @Put('cover')
  async setCover(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @UploadedFile() file: UploadFilePayload | undefined,
  ) {
    await this.institution.setCover(auth, ipOf(req), file);
    return { success: true };
  }

  @RequirePermissions('institution:manage')
  @Delete('cover')
  @HttpCode(204)
  async removeCover(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.institution.removeCover(auth, ipOf(req));
  }
}

/** Información institucional publicada en el portal, sin sesión. */
@ApiTags('public')
@Public()
@Controller('public/institution')
export class PublicInstitutionController {
  constructor(
    @Inject(InstitutionService)
    private readonly institution: InstitutionService,
  ) {}

  @Get()
  info() {
    return this.institution.publicInfo();
  }

  @Get('logo')
  async logo(@Res() res: Response) {
    sendImage(res, await this.institution.readLogo());
  }

  /** Foto de portada del portal (la sube la Liga; si no hay, 404). */
  @Get('cover')
  async cover(@Res() res: Response) {
    sendImage(res, await this.institution.readCover());
  }
}
