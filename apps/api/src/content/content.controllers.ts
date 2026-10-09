import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
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
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import type { UploadFilePayload } from '../documents/documents.schemas.js';
import { AnnouncementsService } from './announcements.service.js';
import {
  announcementListQuerySchema,
  createAnnouncementSchema,
  mediaFormSchema,
  mediaListQuerySchema,
  publicAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from './content.schemas.js';
import { MediaService } from './media.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(
    @Inject(AnnouncementsService)
    private readonly announcements: AnnouncementsService,
  ) {}

  @RequirePermissions('announcements:read')
  @Get()
  list(@Query() query: unknown) {
    return this.announcements.list(
      parseOrThrow(announcementListQuerySchema, query),
    );
  }

  @RequirePermissions('announcements:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.announcements.get(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('announcements:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.announcements.create(
      auth,
      ipOf(req),
      parseOrThrow(createAnnouncementSchema, body),
    );
  }

  @RequirePermissions('announcements:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.announcements.update(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(updateAnnouncementSchema, body),
    );
  }

  @RequirePermissions('announcements:publish')
  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.announcements.publish(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
    );
  }

  @RequirePermissions('announcements:publish')
  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.announcements.unpublish(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
    );
  }

  @RequirePermissions('announcements:publish')
  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.announcements.archive(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
    );
  }

  @RequirePermissions('announcements:delete')
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.announcements.delete(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
    );
  }
}

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @RequirePermissions('announcements:read')
  @Get()
  list(@Query() query: unknown) {
    return this.media.list(parseOrThrow(mediaListQuerySchema, query));
  }

  @RequirePermissions('announcements:manage')
  @AllowMultipart()
  @UseInterceptors(FileInterceptor('file'))
  @Post()
  upload(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
    @UploadedFile() file: UploadFilePayload | undefined,
  ) {
    const { altText } = parseOrThrow(mediaFormSchema, body);
    return this.media.upload(auth, ipOf(req), altText, file);
  }

  @RequirePermissions('announcements:manage')
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.media.delete(parseOrThrow(uuidSchema, id), auth, ipOf(req));
  }
}

/** Noticias, comunicados e imágenes del portal, sin sesión. */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicContentController {
  constructor(
    @Inject(AnnouncementsService)
    private readonly announcements: AnnouncementsService,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}

  @Get('announcements')
  list(@Query() query: unknown) {
    return this.announcements.listPublic(
      parseOrThrow(publicAnnouncementsQuerySchema, query),
    );
  }

  @Get('announcements/:slug')
  get(@Param('slug') slug: string) {
    return this.announcements.getPublic(slug);
  }

  @Get('media/:id')
  async image(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.media.readPublic(
      parseOrThrow(uuidSchema, id),
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }
}
