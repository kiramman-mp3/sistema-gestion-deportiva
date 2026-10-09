import { AuditService } from '../../src/audit/audit.service.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';

describe('auditoría', () => {
  let prisma: PrismaClient;
  let audit: AuditService;

  beforeAll(() => {
    prisma = createTestPrisma();
    audit = new AuditService({ client: prisma } as unknown as PrismaService);
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const newUser = () =>
    prisma.user.create({
      data: {
        email: 'actor@example.com',
        displayName: 'Actor',
        passwordHash: 'h',
      },
    });

  it('registra operación, actor, entidad, valores previos/nuevos, motivo y momento', async () => {
    const actor = await newUser();
    const before = new Date();
    const entry = await audit.record({
      userId: actor.id,
      action: 'result.approve',
      entityType: 'result',
      entityId: 'abc-123',
      before: { status: 'pendiente_revision' },
      after: { status: 'aprobado' },
      reason: 'Acta verificada',
      ipHash: 'sha256:deadbeef',
    });

    const stored = await prisma.auditLog.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(stored).toMatchObject({
      userId: actor.id,
      action: 'result.approve',
      entityType: 'result',
      entityId: 'abc-123',
      beforeSnapshot: { status: 'pendiente_revision' },
      afterSnapshot: { status: 'aprobado' },
      reason: 'Acta verificada',
      ipHash: 'sha256:deadbeef',
    });
    // El momento lo fija la base de datos y es un instante absoluto (timestamptz)
    expect(stored.createdAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
  });

  it('permite acciones sin actor (sistema o usuario no autenticado)', async () => {
    const entry = await audit.record({
      action: 'auth.login_failed',
      entityType: 'user',
    });
    expect(entry.userId).toBeNull();
  });

  it('rechaza registros sin operación o sin tipo de entidad', async () => {
    const noAction = await dbFailure(
      audit.record({ action: ' ', entityType: 'user' }),
    );
    expect(noAction.message).toContain('audit_logs_action_chk');
    const noEntity = await dbFailure(
      audit.record({ action: 'a.b', entityType: '' }),
    );
    expect(noEntity.message).toContain('audit_logs_entity_type_chk');
  });

  it('los registros son inmutables: no se pueden modificar ni borrar', async () => {
    const entry = await audit.record({
      action: 'a.b',
      entityType: 't',
      reason: 'original',
    });

    const update = await dbFailure(
      prisma.auditLog.update({
        where: { id: entry.id },
        data: { reason: 'alterado' },
      }),
    );
    expect(update.message).toContain('inmutables');
    const del = await dbFailure(
      prisma.auditLog.delete({ where: { id: entry.id } }),
    );
    expect(del.message).toContain('inmutables');
    const rawDelete = await dbFailure(
      prisma.$executeRaw`DELETE FROM audit_logs`,
    );
    expect(rawDelete.message).toContain('inmutables');

    const stored = await prisma.auditLog.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(stored.reason).toBe('original');
  });

  it('no se puede borrar un usuario con auditoría: se conserva la trazabilidad', async () => {
    const actor = await newUser();
    await audit.record({
      userId: actor.id,
      action: 'users.create',
      entityType: 'user',
    });

    const failure = await dbFailure(
      prisma.user.delete({ where: { id: actor.id } }),
    );
    expect(failure.sqlState).toBe('23503');
    expect(failure.message).toContain('audit_logs_user_id_fkey');
    expect(await prisma.auditLog.count()).toBe(1);

    // Desactivar sí es posible y no altera el historial
    await prisma.user.update({
      where: { id: actor.id },
      data: { status: 'inactivo' },
    });
    expect(await prisma.auditLog.count({ where: { userId: actor.id } })).toBe(
      1,
    );
  });

  it('se puede consultar el historial de una entidad en orden cronológico', async () => {
    for (const action of ['season.create', 'season.update', 'season.close']) {
      await audit.record({ action, entityType: 'season', entityId: 's1' });
    }
    await audit.record({
      action: 'season.create',
      entityType: 'season',
      entityId: 's2',
    });

    const history = await prisma.auditLog.findMany({
      where: { entityType: 'season', entityId: 's1' },
      orderBy: { id: 'asc' }, // UUID v7: ordenable por tiempo
    });
    expect(history.map((h) => h.action)).toEqual([
      'season.create',
      'season.update',
      'season.close',
    ]);
  });
});
