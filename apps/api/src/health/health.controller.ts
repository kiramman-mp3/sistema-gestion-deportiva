import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export interface HealthStatus {
  status: 'ok';
  service: string;
  timestamp: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'La API está en ejecución.' })
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'liga-api',
      timestamp: new Date().toISOString(),
    };
  }
}
