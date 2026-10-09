import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthContext, AuthedRequest } from '../../auth/auth.types.js';
import { CurrentAuth, RequirePermissions } from '../../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../../auth/schemas.js';
import {
  categoryListQuerySchema,
  categoryStatusSchema,
  createCategorySchema,
  updateCategorySchema,
} from './categories.schemas.js';
import { CategoriesService } from './categories.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    @Inject(CategoriesService) private readonly categories: CategoriesService,
  ) {}

  @RequirePermissions('categories:read')
  @Get()
  list(@Query() query: unknown) {
    return this.categories.list(parseOrThrow(categoryListQuerySchema, query));
  }

  @RequirePermissions('categories:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.categories.get(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('categories:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.categories.create(
      auth,
      parseOrThrow(createCategorySchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('categories:manage')
  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.categories.update(
      auth,
      parseOrThrow(uuidSchema, id),
      parseOrThrow(updateCategorySchema, body),
      ipOf(req),
    );
  }

  @RequirePermissions('categories:manage')
  @Patch(':id/status')
  setStatus(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { status, reason } = parseOrThrow(categoryStatusSchema, body);
    return this.categories.setStatus(
      auth,
      parseOrThrow(uuidSchema, id),
      status,
      reason,
      ipOf(req),
    );
  }

  @RequirePermissions('categories:delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.categories.remove(auth, parseOrThrow(uuidSchema, id), ipOf(req));
  }
}
