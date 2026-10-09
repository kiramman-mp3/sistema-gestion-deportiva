import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { BootstrapService } from './bootstrap.service.js';
import { CredentialTokenService } from './credential-token.service.js';
import { AuthGuard, OriginGuard, PermissionsGuard } from './guards.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { PasswordFlowsService } from './password-flows.service.js';
import { PasswordService } from './password.service.js';
import { SecurityHashService } from './security-hash.service.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [AuditModule, AuthzModule],
  controllers: [AuthController],
  providers: [
    SecurityHashService,
    PasswordService,
    SessionService,
    CredentialTokenService,
    LoginThrottleService,
    AuthService,
    PasswordFlowsService,
    BootstrapService,
    // El orden importa: origen → autenticación (+CSRF) → permisos.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [
    SecurityHashService,
    PasswordService,
    SessionService,
    CredentialTokenService,
    BootstrapService,
  ],
})
export class AuthModule {}
