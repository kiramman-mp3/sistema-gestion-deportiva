import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';
import { OfficialsController } from './officials.controller.js';
import { OfficialsService } from './officials.service.js';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, NotificationsModule],
  controllers: [OfficialsController, AssignmentsController],
  providers: [OfficialsService, AssignmentsService],
  exports: [OfficialsService, AssignmentsService],
})
export class OfficialsModule {}
