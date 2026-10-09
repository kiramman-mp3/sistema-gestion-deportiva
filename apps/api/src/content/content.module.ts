import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { InstitutionModule } from '../institution/institution.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AnnouncementsService } from './announcements.service.js';
import {
  AnnouncementsController,
  MediaController,
  PublicContentController,
} from './content.controllers.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    StorageModule,
    InstitutionModule,
  ],
  controllers: [
    AnnouncementsController,
    MediaController,
    PublicContentController,
  ],
  providers: [AnnouncementsService, MediaService],
  exports: [AnnouncementsService],
})
export class ContentModule {}
