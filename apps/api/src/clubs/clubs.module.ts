import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { PeopleModule } from '../people/people.module.js';
import { ClubAccessService } from './club-access.service.js';
import { ClubMembersService } from './club-members.service.js';
import { ClubsController } from './clubs.controller.js';
import { ClubsService } from './clubs.service.js';

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, PeopleModule],
  controllers: [ClubsController],
  providers: [ClubAccessService, ClubsService, ClubMembersService],
  exports: [ClubAccessService],
})
export class ClubsModule {}
