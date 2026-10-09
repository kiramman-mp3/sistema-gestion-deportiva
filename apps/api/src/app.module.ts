import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule],
  controllers: [HealthController],
})
export class AppModule {}
