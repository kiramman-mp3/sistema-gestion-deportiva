import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { SUPERADMIN_ROLE } from '../authz/permissions.js';
import { PrismaService } from '../database/prisma.service.js';
import { PasswordService } from './password.service.js';
import { emailSchema, newPasswordSchema } from './schemas.js';

export const bootstrapInputSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(120),
  password: newPasswordSchema,
});

export class BootstrapError extends Error {}

/**
 * Crea la PRIMERA cuenta con el rol `superadmin`. No está expuesto por HTTP:
 * solo lo invoca la CLI (`npm run admin:create-superadmin`), que requiere acceso
 * al servidor y a la base de datos. Se niega a actuar si ya existe algún usuario
 * con ese rol, por lo que no sirve para crear administradores adicionales.
 */
@Injectable()
export class BootstrapService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async createFirstSuperadmin(
    input: unknown,
  ): Promise<{ id: string; email: string }> {
    const parsed = bootstrapInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BootstrapError(
        'Datos inválidos: ' +
          parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
      );
    }
    const { email, displayName, password } = parsed.data;
    const localPart = email.split('@')[0] ?? '';
    if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
      throw new BootstrapError(
        'La contraseña no debe contener el nombre de usuario del correo.',
      );
    }
    const passwordHash = await this.passwords.hash(password);

    return this.prisma.client.$transaction(async (tx) => {
      // Serializa ejecuciones concurrentes del bootstrap.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('liga:bootstrap-superadmin'))`;

      const role = await tx.role.findUnique({
        where: { code: SUPERADMIN_ROLE.code },
      });
      if (!role) {
        throw new BootstrapError(
          'No existe el rol superadmin. Ejecute primero `npm run db:seed`.',
        );
      }
      const holders = await tx.userRole.count({ where: { roleId: role.id } });
      if (holders > 0) {
        throw new BootstrapError(
          'Ya existe un superadministrador: el bootstrap solo puede ejecutarse una vez.',
        );
      }
      if (
        await tx.user.findUnique({ where: { email }, select: { id: true } })
      ) {
        throw new BootstrapError('Ya existe un usuario con ese correo.');
      }

      const user = await tx.user.create({
        data: { email, displayName, passwordHash, status: 'activo' },
        select: { id: true, email: true },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      await this.audit.record(
        {
          action: 'auth.bootstrap_superadmin',
          entityType: 'user',
          entityId: user.id,
          after: { email: user.email, role: SUPERADMIN_ROLE.code },
          reason: 'Creación inicial por CLI de operador',
        },
        tx,
      );
      return user;
    });
  }
}
