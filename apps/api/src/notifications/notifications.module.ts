import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ClubsModule } from '../clubs/clubs.module.js';
import { ConfigModule, ENV, type Env } from '../config/config.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { InstitutionModule } from '../institution/institution.module.js';
import { createMailTransporter, MAIL_TRANSPORTER } from './mail.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsDispatcher } from './notifications.dispatcher.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    ClubsModule,
    InstitutionModule,
  ],
  controllers: [NotificationsController],
  providers: [
    {
      provide: MAIL_TRANSPORTER,
      inject: [ENV],
      useFactory: (env: Env) => createMailTransporter(env),
    },
    NotificationsService,
    NotificationsDispatcher,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
