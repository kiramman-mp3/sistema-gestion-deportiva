import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { ClubsModule } from '../clubs/clubs.module.js';
import { RosterService } from './roster.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, ClubsModule],
  controllers: [TeamsController],
  providers: [TeamsService, RosterService],
  exports: [RosterService],
})
export class TeamsModule {}
