import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ENV, type Env } from '../config/config.module.js';
import { NotificationsService } from './notifications.service.js';

const INTERVAL_MS = 60_000;

/**
 * Despacha periódicamente los correos pendientes. Solo corre si hay un transporte de correo
 * configurado y fuera de las pruebas (que invocan `dispatchPending` de forma explícita).
 */
@Injectable()
export class NotificationsDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test' || !this.notifications.mailEnabled) return;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.notifications.dispatchPending();
    } catch (error) {
      this.logger.error(
        'Falló el despacho de correos',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
