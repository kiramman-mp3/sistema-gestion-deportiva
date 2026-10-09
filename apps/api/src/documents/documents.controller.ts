import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import {
  AllowMultipart,
  CurrentAuth,
  RequirePermissions,
} from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import {
  type UploadFilePayload,
  uploadDocumentSchema,
  verifyDocumentSchema,
} from './documents.schemas.js';
import { DocumentsService } from './documents.service.js';

@ApiTags('documents')
@Controller('athletes/:id')
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}

  @Post('photo')
  @RequirePermissions('documents:manage')
  @AllowMultipart()
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @UploadedFile() file: UploadFilePayload | undefined,
    @Req() req: Request,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    const ip = req.ip || '127.0.0.1';
    return this.documents.uploadPhoto(auth, athleteId, file, ip);
  }

  @Get('photo')
  @RequirePermissions('athletes:read')
  async getPhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    const result = await this.documents.getPhoto(auth, athleteId);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.buffer);
  }

  @Delete('photo')
  @RequirePermissions('documents:manage')
  async deletePhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    const ip = req.ip || '127.0.0.1';
    return this.documents.deletePhoto(auth, athleteId, ip);
  }

  @Post('documents')
  @RequirePermissions('documents:manage')
  @AllowMultipart()
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadFilePayload | undefined,
    @Req() req: Request,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    const input = parseOrThrow(uploadDocumentSchema, body);
    const ip = req.ip || '127.0.0.1';
    return this.documents.uploadDocument(auth, athleteId, input, file, ip);
  }

  @Get('documents')
  @RequirePermissions('documents:read')
  async listDocuments(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    return this.documents.listDocuments(auth, athleteId);
  }

  @Get('documents/:docId/file')
  @RequirePermissions('documents:read')
  async getDocumentFile(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    const documentId = parseOrThrow(uuidSchema, docId);
    const result = await this.documents.getDocumentFile(
      auth,
      athleteId,
      documentId,
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(result.originalName)}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.buffer);
  }

  @Patch('documents/:docId/verify')
  @RequirePermissions('documents:manage')
  async verifyDocument(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    const documentId = parseOrThrow(uuidSchema, docId);
    const input = parseOrThrow(verifyDocumentSchema, body);
    const ip = req.ip || '127.0.0.1';
    return this.documents.verifyDocument(
      auth,
      athleteId,
      documentId,
      input,
      ip,
    );
  }

  @Delete('documents/:docId')
  @RequirePermissions('documents:manage')
  async deleteDocument(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Req() req: Request,
  ) {
    const athleteId = parseOrThrow(uuidSchema, id);
    const documentId = parseOrThrow(uuidSchema, docId);
    const ip = req.ip || '127.0.0.1';
    return this.documents.deleteDocument(auth, athleteId, documentId, ip);
  }
}
