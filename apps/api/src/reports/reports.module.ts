import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ClubsModule } from '../clubs/clubs.module.js';
import { CompetitionsModule } from '../competitions/competitions.module.js';
import { ConfigModule } from '../config/config.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { InstitutionModule } from '../institution/institution.module.js';
import { PublicModule } from '../public/public.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { IssuedDocumentsService } from './issued-documents.service.js';
import { PdfService } from './pdf.service.js';
import {
  IssuedDocumentsController,
  PublicDocumentsController,
  ReportsController,
} from './reports.controllers.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    ClubsModule,
    CompetitionsModule,
    InstitutionModule,
    PublicModule,
    StorageModule,
  ],
  controllers: [
    ReportsController,
    IssuedDocumentsController,
    PublicDocumentsController,
  ],
  providers: [PdfService, ReportsService, IssuedDocumentsService],
  exports: [PdfService, ReportsService, IssuedDocumentsService],
})
export class ReportsModule {}
