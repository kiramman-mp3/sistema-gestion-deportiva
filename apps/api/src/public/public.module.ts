import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module.js';
import { CompetitionsModule } from '../competitions/competitions.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { InstitutionModule } from '../institution/institution.module.js';
import { PublicController } from './public.controller.js';

@Module({
  imports: [
    AthletesModule,
    DocumentsModule,
    CompetitionsModule,
    InstitutionModule,
  ],
  controllers: [PublicController],
})
export class PublicModule {}
