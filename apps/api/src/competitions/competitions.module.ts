import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ClubsModule } from '../clubs/clubs.module.js';
import { PrismaModule } from '../database/prisma.module.js';
import { ChampionshipsController } from './championships/championships.controller.js';
import { ChampionshipsService } from './championships/championships.service.js';
import { RegistrationsController } from './registrations/registrations.controller.js';
import { RegistrationsService } from './registrations/registrations.service.js';
import { VenuesController } from './venues/venues.controller.js';
import { VenuesService } from './venues/venues.service.js';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, ClubsModule],
  controllers: [
    VenuesController,
    ChampionshipsController,
    RegistrationsController,
  ],
  providers: [
    VenuesService,
    ChampionshipsService,
    RegistrationsService,
  ],
  exports: [
    VenuesService,
    ChampionshipsService,
    RegistrationsService,
  ],
})
export class CompetitionsModule {}
