import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module.js';
import { PublicController } from './public.controller.js';

@Module({ imports: [AthletesModule], controllers: [PublicController] })
export class PublicModule {}
