import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { UsersService } from './users.service.js';
import { UsersAdminController } from './users-admin.controller.js';
import { UsersAdminService } from './users-admin.service.js';

@Module({
  imports: [AuthModule, AuthzModule, AuditModule],
  controllers: [UsersAdminController, RolesController],
  providers: [UsersAdminService, UsersService, RolesService],
})
export class UsersModule {}
