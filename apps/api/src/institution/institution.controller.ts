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
    return { ...row, hasLogo: row.logoFileId !== null };
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
    return { ...row, hasLogo: row.logoFileId !== null };
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
    const { buffer, mimeType } = await this.institution.readLogo();
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }
}
