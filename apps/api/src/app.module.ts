import { Module } from '@nestjs/common';
import { AthletesModule } from './athletes/athletes.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthzModule } from './authz/authz.module.js';
import { CatalogsModule } from './catalogs/catalogs.module.js';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { HealthController } from './health/health.controller.js';
import { InstitutionModule } from './institution/institution.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ClubsModule } from './clubs/clubs.module.js';
import { PeopleModule } from './people/people.module.js';
import { PublicModule } from './public/public.module.js';
import { StorageModule } from './storage/storage.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { CompetitionsModule } from './competitions/competitions.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    AuthzModule,
    AuthModule,
    UsersModule,
    CatalogsModule,
    PeopleModule,
    ClubsModule,
    AthletesModule,
    TeamsModule,
    StorageModule,
    DocumentsModule,
    CompetitionsModule,
    InstitutionModule,
    NotificationsModule,
    PublicModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
