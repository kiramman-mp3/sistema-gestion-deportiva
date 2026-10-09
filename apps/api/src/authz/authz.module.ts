import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service.js';
import { PrivilegesService } from './privileges.service.js';

@Module({
  providers: [PermissionsService, PrivilegesService],
  exports: [PermissionsService, PrivilegesService],
})
export class AuthzModule {}
