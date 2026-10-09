import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  InstitutionController,
  PublicInstitutionController,
} from './institution.controller.js';
import { InstitutionService } from './institution.service.js';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, StorageModule],
  controllers: [InstitutionController, PublicInstitutionController],
  providers: [InstitutionService],
  exports: [InstitutionService],
})
export class InstitutionModule {}
