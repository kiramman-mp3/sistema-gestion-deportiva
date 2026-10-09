import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ClubsModule } from '../clubs/clubs.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { InstitutionModule } from '../institution/institution.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CasesService } from './cases.service.js';
import { ComplaintsService } from './complaints.service.js';
import {
  CasesController,
  ComplaintsController,
  IncidentsController,
  PublicResolutionsController,
  SanctionsController,
} from './discipline.controllers.js';
import { IncidentsService } from './incidents.service.js';
import { SanctionsService } from './sanctions.service.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    ClubsModule,
    StorageModule,
    NotificationsModule,
    InstitutionModule,
  ],
  controllers: [
    IncidentsController,
    ComplaintsController,
    CasesController,
    SanctionsController,
    PublicResolutionsController,
  ],
  providers: [
    IncidentsService,
    ComplaintsService,
    CasesService,
    SanctionsService,
  ],
  exports: [CasesService, SanctionsService],
})
export class DisciplineModule {}
