import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module.js';
import { CompetitionsModule } from '../competitions/competitions.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { InstitutionModule } from '../institution/institution.module.js';
import { ContentModule } from '../content/content.module.js';
import { PublicController } from './public.controller.js';
import { PublicPortalController } from './public-portal.controller.js';
import { PublicNamesService } from './public-names.service.js';

@Module({
  imports: [
    AthletesModule,
    DocumentsModule,
    CompetitionsModule,
    InstitutionModule,
    ContentModule,
  ],
  controllers: [PublicController, PublicPortalController],
  providers: [PublicNamesService],
  exports: [PublicNamesService],
})
export class PublicModule {}
