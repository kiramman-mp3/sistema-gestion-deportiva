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
  createVenueSchema,
  updateVenueSchema,
  venueListQuerySchema,
} from './venues.schemas.js';
import { VenuesService } from './venues.service.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('venues')
@Controller('venues')
export class VenuesController {
  constructor(@Inject(VenuesService) private readonly venues: VenuesService) {}

  @RequirePermissions('venues:read')
  @Get()
  list(@Query() query: unknown) {
    return this.venues.list(parseOrThrow(venueListQuerySchema, query));
  }

  @RequirePermissions('venues:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.venues.get(parseOrThrow(uuidSchema, id));
  }

  @RequirePermissions('venues:manage')
  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.venues.create(
      auth,
      ipOf(req),
      parseOrThrow(createVenueSchema, body),
    );
  }

  @RequirePermissions('venues:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.venues.update(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(updateVenueSchema, body),
    );
  }

  @RequirePermissions('venues:delete')
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.venues.delete(parseOrThrow(uuidSchema, id), auth, ipOf(req));
  }
}
