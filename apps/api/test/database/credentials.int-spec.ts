import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';

const HASH = 'a'.repeat(64);

describe('restricciones de cuentas pendientes y tokens de credencial', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const user = (data: {
    email?: string;
    status?: 'pendiente' | 'activo' | 'inactivo' | 'bloqueado';
    passwordHash?: string | null;
  }) =>
    prisma.user.create({
      data: {
        email: data.email ?? 'a@liga.example',
        displayName: 'A',
        status: data.status ?? 'activo',
        passwordHash:
          data.passwordHash === undefined ? 'hash' : data.passwordHash,
      },
    });

  it('una cuenta activa siempre tiene contraseña', async () => {
    const failure = await dbFailure(
      user({ status: 'activo', passwordHash: null }),
    );
    expect(failure.sqlState).toBe('23514');
    expect(failure.message).toContain('users_active_requires_password_chk');
  });

  it('una cuenta pendiente nunca tiene contraseña', async () => {
    const failure = await dbFailure(
      user({ status: 'pendiente', passwordHash: 'hash' }),
    );
    expect(failure.message).toContain('users_pending_without_password_chk');
    const ok = await user({ status: 'pendiente', passwordHash: null });
    expect(ok.passwordHash).toBeNull();
  });

  it('una cuenta desactivada o bloqueada puede carecer de contraseña, pero no tenerla vacía', async () => {
    await user({
      email: 'b@liga.example',
      status: 'inactivo',
      passwordHash: null,
    });
    await user({
      email: 'c@liga.example',
      status: 'bloqueado',
      passwordHash: null,
    });
    expect(
      (await dbFailure(user({ email: 'd@liga.example', passwordHash: '' })))
        .message,
    ).toContain('users_password_hash_chk');
  });

  it('no se puede activar una cuenta pendiente sin fijar su contraseña (ni borrarla a una activa)', async () => {
    const pending = await user({ status: 'pendiente', passwordHash: null });
    expect(
      (
        await dbFailure(
          prisma.user.update({
            where: { id: pending.id },
            data: { status: 'activo' },
          }),
        )
      ).message,
    ).toContain('users_active_requires_password_chk');
    await prisma.user.update({
      where: { id: pending.id },
      data: { status: 'activo', passwordHash: 'hash' },
    });
    expect(
      (
        await dbFailure(
          prisma.user.update({
            where: { id: pending.id },
            data: { passwordHash: null },
          }),
        )
      ).message,
    ).toContain('users_active_requires_password_chk');
  });

  describe('credential_tokens', () => {
    const token = (userId: string, over: Record<string, unknown> = {}) =>
      prisma.credentialToken.create({
        data: {
          userId,
          kind: 'activacion',
          tokenHash: HASH,
          expiresAt: new Date(Date.now() + 3_600_000),
          ...over,
        } as never,
      });

    it('exige un hash SHA-256 en hexadecimal y único', async () => {
      const u = await user({});
      expect(
        (await dbFailure(token(u.id, { tokenHash: 'corto' }))).message,
      ).toContain('credential_tokens_hash_format_chk');
      expect(
        (await dbFailure(token(u.id, { tokenHash: 'A'.repeat(64) }))).message,
      ).toContain('credential_tokens_hash_format_chk');
      await token(u.id);
      expect((await dbFailure(token(u.id))).sqlState).toBe('23505');
    });

    it('el vencimiento es posterior a la creación y un token no puede estar a la vez usado y anulado', async () => {
      const u = await user({});
      expect(
        (
          await dbFailure(
            token(u.id, { expiresAt: new Date(Date.now() - 1000) }),
          )
        ).message,
      ).toContain('credential_tokens_expires_after_created_chk');
      expect(
        (
          await dbFailure(
            token(u.id, { usedAt: new Date(), revokedAt: new Date() }),
          )
        ).message,
      ).toContain('credential_tokens_single_end_chk');
    });

    it('se eliminan con la cuenta, pero quien los emitió no puede borrarse', async () => {
      const issuer = await user({ email: 'admin@liga.example' });
      const owner = await user({ email: 'owner@liga.example' });
      await token(owner.id, { createdById: issuer.id });
      expect(
        (await dbFailure(prisma.user.delete({ where: { id: issuer.id } })))
          .sqlState,
      ).toBe('23503');
      await prisma.credentialToken.deleteMany();
      await prisma.user.delete({ where: { id: issuer.id } });
    });

    it('exige un usuario existente', async () => {
      expect(
        (await dbFailure(token('0197aaaa-0000-7000-8000-000000000000')))
          .sqlState,
      ).toBe('23503');
    });
  });
});
