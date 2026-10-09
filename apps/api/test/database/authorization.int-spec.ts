import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestPrisma, dbFailure, resetDatabase } from '../support/db.js';

const UNIQUE = '23505';
const CHECK = '23514';
const FK = '23503';

describe('usuarios, roles y permisos', () => {
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

  const newUser = (email = 'persona@example.com') =>
    prisma.user.create({
      data: {
        email,
        displayName: 'Persona de prueba',
        passwordHash: 'hash-de-prueba',
      },
    });

  it('un usuario puede tener varios roles y heredar los permisos de todos', async () => {
    const [read, write, approve] = await Promise.all(
      ['a:read', 'a:write', 'b:approve'].map((code) =>
        prisma.permission.create({ data: { code, description: code } }),
      ),
    );
    const editor = await prisma.role.create({
      data: {
        code: 'editor',
        name: 'Editor',
        permissions: {
          create: [{ permissionId: read.id }, { permissionId: write.id }],
        },
      },
    });
    const approver = await prisma.role.create({
      data: {
        code: 'approver',
        name: 'Aprobador',
        permissions: {
          create: [{ permissionId: read.id }, { permissionId: approve.id }],
        },
      },
    });
    const user = await newUser();
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: editor.id },
        { userId: user.id, roleId: approver.id },
      ],
    });

    const loaded = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    expect(loaded.roles).toHaveLength(2);
    const codes = new Set(
      loaded.roles.flatMap((ur) =>
        ur.role.permissions.map((rp) => rp.permission.code),
      ),
    );
    expect([...codes].sort()).toEqual(['a:read', 'a:write', 'b:approve']);
  });

  it('rechaza correos duplicados', async () => {
    await newUser('dup@example.com');
    const failure = await dbFailure(newUser('dup@example.com'));
    expect(failure.sqlState).toBe(UNIQUE);
    expect(failure.message).toContain('users_email_key');
  });

  it('rechaza correos con mayúsculas (se guardan normalizados)', async () => {
    const failure = await dbFailure(newUser('Mayus@Example.com'));
    expect(failure.sqlState).toBe(CHECK);
    expect(failure.message).toContain('users_email_lowercase_chk');
  });

  it('rechaza nombre vacío y hash vacío', async () => {
    const blankName = await dbFailure(
      prisma.user.create({
        data: { email: 'a@example.com', displayName: '  ', passwordHash: 'h' },
      }),
    );
    expect(blankName.message).toContain('users_display_name_chk');
    const blankHash = await dbFailure(
      prisma.user.create({
        data: { email: 'b@example.com', displayName: 'B', passwordHash: '' },
      }),
    );
    expect(blankHash.message).toContain('users_password_hash_chk');
  });

  it('rechaza un estado de usuario inexistente', async () => {
    const failure = await dbFailure(
      prisma.$executeRaw`INSERT INTO users (id, email, display_name, password_hash, status, updated_at)
        VALUES (gen_random_uuid(), 'x@example.com', 'X', 'h', 'eliminado'::text::user_status, now())`,
    );
    expect(failure.sqlState).toBe('22P02');
  });

  it('no permite asignar dos veces el mismo rol al mismo usuario', async () => {
    const role = await prisma.role.create({ data: { code: 'r1', name: 'R1' } });
    const user = await newUser();
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    const failure = await dbFailure(
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }),
    );
    expect(failure.sqlState).toBe(UNIQUE);
  });

  it('exige que existan el usuario y el rol al asignar (integridad referencial)', async () => {
    const failure = await dbFailure(
      prisma.userRole.create({
        data: {
          userId: '0197aaaa-0000-7000-8000-000000000000',
          roleId: '0197aaaa-0000-7000-8000-000000000001',
        },
      }),
    );
    expect(failure.sqlState).toBe(FK);
  });

  it('no permite eliminar un usuario con roles ni un rol asignado', async () => {
    const role = await prisma.role.create({ data: { code: 'r2', name: 'R2' } });
    const user = await newUser();
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });

    const userDelete = await dbFailure(
      prisma.user.delete({ where: { id: user.id } }),
    );
    expect(userDelete.sqlState).toBe(FK);
    expect(userDelete.message).toContain('user_roles_user_id_fkey');
    const roleDelete = await dbFailure(
      prisma.role.delete({ where: { id: role.id } }),
    );
    expect(roleDelete.sqlState).toBe(FK);
    expect(roleDelete.message).toContain('user_roles_role_id_fkey');
  });

  it('valida el formato de códigos de rol y de permiso', async () => {
    const badRole = await dbFailure(
      prisma.role.create({ data: { code: 'Mal Código', name: 'X' } }),
    );
    expect(badRole.message).toContain('roles_code_format_chk');
    const badPermission = await dbFailure(
      prisma.permission.create({
        data: { code: 'sin-formato', description: 'x' },
      }),
    );
    expect(badPermission.message).toContain('permissions_code_format_chk');
  });

  it('eliminar un rol sin usuarios elimina sus asignaciones de permisos, no los permisos', async () => {
    const permission = await prisma.permission.create({
      data: { code: 'x:read', description: 'x' },
    });
    const role = await prisma.role.create({
      data: {
        code: 'temporal',
        name: 'Temporal',
        permissions: { create: { permissionId: permission.id } },
      },
    });
    await prisma.role.delete({ where: { id: role.id } });
    expect(await prisma.rolePermission.count()).toBe(0);
    expect(await prisma.permission.count()).toBe(1);
  });

  it('protege los roles de sistema contra el borrado', async () => {
    const role = await prisma.role.create({
      data: { code: 'sistema', name: 'Sistema', isSystem: true },
    });
    const failure = await dbFailure(
      prisma.role.delete({ where: { id: role.id } }),
    );
    expect(failure.message).toContain('rol de sistema');
    expect(await prisma.role.count()).toBe(1);
  });

  it('la desactivación de un usuario conserva el registro', async () => {
    const user = await newUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'inactivo' },
    });
    const found = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(found.status).toBe('inactivo');
    expect(found.updatedAt.getTime()).toBeGreaterThanOrEqual(
      found.createdAt.getTime(),
    );
  });
});
