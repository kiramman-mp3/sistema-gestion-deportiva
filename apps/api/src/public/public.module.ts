import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { PublicController } from './public.controller.js';

@Module({
  imports: [AthletesModule, DocumentsModule],
  controllers: [PublicController],
})
export class PublicModule {}

