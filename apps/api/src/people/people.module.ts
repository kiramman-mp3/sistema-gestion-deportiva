import { Module } from '@nestjs/common';
import { CIVIL_REGISTRY, UnconfiguredCivilRegistry } from './civil-registry.js';
import { PersonsService } from './persons.service.js';

@Module({
  providers: [
    PersonsService,
    { provide: CIVIL_REGISTRY, useClass: UnconfiguredCivilRegistry },
  ],
  exports: [PersonsService, CIVIL_REGISTRY],
})
export class PeopleModule {}
