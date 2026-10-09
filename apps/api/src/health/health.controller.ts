import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../database/prisma.service.js';

export interface HealthStatus {
  status: 'ok';
  service: string;
  timestamp: string;
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Liveness: el proceso responde. No toca la base de datos. */
  @Get()
  @ApiOkResponse({ description: 'La API está en ejecución.' })
  check(): HealthStatus {
    return this.status();
  }

  /** Readiness: la API puede atender peticiones (base de datos accesible). */
  @Get('ready')
  @ApiOkResponse({
    description: 'La API y la base de datos están disponibles.',
  })
  @ApiServiceUnavailableResponse({
    description: 'La base de datos no responde.',
  })
  async ready(): Promise<HealthStatus> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch (error) {
      // El detalle se registra en el servidor; al cliente no se expone nada interno.
      this.logger.error('Fallo de conexión con la base de datos', error);
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
    return this.status();
  }

  private status(): HealthStatus {
    return {
      status: 'ok',
      service: 'liga-api',
      timestamp: new Date().toISOString(),
    };
  }
}
