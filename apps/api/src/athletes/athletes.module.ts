import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { ClubsModule } from '../clubs/clubs.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { PeopleModule } from '../people/people.module.js';
import { AthletesController } from './athletes.controller.js';
import { AthletesService } from './athletes.service.js';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    AuthzModule,
    ClubsModule,
    PeopleModule,
    TeamsModule,
  ],
  controllers: [AthletesController],
  providers: [AthletesService],
  exports: [AthletesService],
})
export class AthletesModule {}
