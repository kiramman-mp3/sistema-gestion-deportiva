import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { SecurityHashService } from '../../auth/security-hash.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  CatalogStatus,
  Category,
  Prisma,
} from '../../generated/prisma/client.js';
import {
  type Page,
  changedFields,
  escapeLike,
  translateDbError,
} from '../common.js';
import {
  type CreateCategoryInput,
  type UpdateCategoryInput,
  ageRangeError,
} from './categories.schemas.js';

type Actor = Pick<AuthContext, 'user'>;

export interface CategoryView {
  id: string;
  code: string;
  name: string;
  ageMin: number | null;
  ageMax: number | null;
  sortOrder: number;
  status: CatalogStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ERRORS = {
  unique: {
    categories_code_key: 'Ya existe una categoría con ese código',
    categories_name_key: 'Ya existe una categoría con ese nombre',
  },
  inUse:
    'La categoría está en uso y no puede eliminarse. Desactívela en su lugar.',
};

const toView = (c: Category): CategoryView => ({
  id: c.id,
  code: c.code,
  name: c.name,
  ageMin: c.ageMin,
  ageMax: c.ageMax,
  sortOrder: c.sortOrder,
  status: c.status,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const snapshot = (c: Category) => ({
  code: c.code,
  name: c.name,
  ageMin: c.ageMin,
  ageMax: c.ageMax,
  sortOrder: c.sortOrder,
  status: c.status,
});

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SecurityHashService) private readonly hasher: SecurityHashService,
  ) {}

  async list(query: {
    page: number;
    pageSize: number;
    q?: string;
    status?: CatalogStatus;
  }): Promise<Page<CategoryView>> {
    const where: Prisma.CategoryWhereInput = {
      status: query.status,
      ...(query.q && {
        OR: [
          { name: { contains: escapeLike(query.q), mode: 'insensitive' } },
          { code: { contains: escapeLike(query.q), mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.category.count({ where }),
    ]);
    return {
      items: items.map(toView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<CategoryView> {
    const category = await this.prisma.client.category.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return toView(category);
  }

  async create(
    actor: Actor,
    input: CreateCategoryInput,
    ip: string,
  ): Promise<CategoryView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.assertNameFree(tx, input.name);
        const category = await tx.category.create({ data: input });
        await this.record(tx, actor, ip, 'category.create', category.id, {
          after: snapshot(category),
        });
        return toView(category);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async update(
    actor: Actor,
    id: string,
    input: UpdateCategoryInput,
    ip: string,
  ): Promise<CategoryView> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const current = await this.load(tx, id);

        // La coherencia se valida sobre el resultado, no solo sobre lo enviado.
        const ageMin =
          input.ageMin !== undefined ? input.ageMin : current.ageMin;
        const ageMax =
          input.ageMax !== undefined ? input.ageMax : current.ageMax;
        const rangeError = ageRangeError(ageMin, ageMax);
        if (rangeError) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'Solicitud inválida',
            errors: [{ field: 'ageMax', message: rangeError }],
          });
        }
        if (input.name) await this.assertNameFree(tx, input.name, id);

        const diff = changedFields(snapshot(current), {
          ...snapshot(current),
          ...input,
        });
        if (!diff) return toView(current);

        const updated = await tx.category.update({
          where: { id },
          data: input,
        });
        await this.record(tx, actor, ip, 'category.update', id, diff);
        return toView(updated);
      });
    } catch (error) {
      return translateDbError(error, ERRORS);
    }
  }

  async setStatus(
    actor: Actor,
    id: string,
    status: CatalogStatus,
    reason: string | undefined,
    ip: string,
  ): Promise<CategoryView> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.load(tx, id);
      if (current.status === status) return toView(current);

      const updated = await tx.category.update({
        where: { id },
        data: { status },
      });
      await this.record(
        tx,
        actor,
        ip,
        'category.status_change',
        id,
        { before: { status: current.status }, after: { status } },
        reason,
      );
      return toView(updated);
    });
  }

  /** Elimina una categoría; la FK RESTRICT de la base de datos impide borrar una en uso (409). */
  async remove(actor: Actor, id: string, ip: string): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        const current = await this.load(tx, id);
        await tx.category.delete({ where: { id } });
        await this.record(tx, actor, ip, 'category.delete', id, {
          before: snapshot(current),
        });
      });
    } catch (error) {
      translateDbError(error, ERRORS);
    }
  }

  // ───────────────────────────── internos ─────────────────────────────

  private async load(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<Category> {
    const category = await tx.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  private async assertNameFree(
    tx: Prisma.TransactionClient,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await tx.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        id: { not: exceptId },
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(ERRORS.unique.categories_name_key);
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: Actor,
    ip: string,
    action: string,
    entityId: string,
    change: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
    reason?: string,
  ) {
    return this.audit.record(
      {
        userId: actor.user.id,
        action,
        entityType: 'category',
        entityId,
        before: change.before,
        after: change.after,
        reason,
        ipHash: this.hasher.hash('ip', ip),
      },
      tx,
    );
  }
}
