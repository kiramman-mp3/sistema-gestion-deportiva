import { Module } from '@nestjs/common';
import { PersonsService } from './persons.service.js';

@Module({
  providers: [PersonsService],
  exports: [PersonsService],
})
export class PeopleModule {}
