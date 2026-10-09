import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesController } from './categories/categories.controller.js';
import { CategoriesService } from './categories/categories.service.js';
import { SeasonsController } from './seasons/seasons.controller.js';
import { SeasonsService } from './seasons/seasons.service.js';
import { SportsController } from './sports/sports.controller.js';
import { SportsService } from './sports/sports.service.js';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [SportsController, CategoriesController, SeasonsController],
  providers: [SportsService, CategoriesService, SeasonsService],
})
export class CatalogsModule {}
