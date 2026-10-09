import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthContext, AuthedRequest } from '../auth/auth.types.js';
import { CurrentAuth, RequirePermissions } from '../auth/decorators.js';
import { parseOrThrow, uuidSchema } from '../auth/schemas.js';
import { AssignmentsService } from './assignments.service.js';
import {
  createAssignmentSchema,
  myAssignmentsQuerySchema,
  removeAssignmentSchema,
  respondAssignmentSchema,
} from './officials.schemas.js';

const ipOf = (req: AuthedRequest) => req.ip ?? 'desconocida';

@ApiTags('assignments')
@Controller()
export class AssignmentsController {
  constructor(
    @Inject(AssignmentsService)
    private readonly assignments: AssignmentsService,
  ) {}

  @RequirePermissions('assignments:read')
  @Get('events/:eventId/assignments')
  list(@Param('eventId') eventId: string) {
    return this.assignments.listForEvent(parseOrThrow(uuidSchema, eventId));
  }

  @RequirePermissions('assignments:manage')
  @Get('events/:eventId/assignment-candidates')
  candidates(@Param('eventId') eventId: string) {
    return this.assignments.candidates(parseOrThrow(uuidSchema, eventId));
  }

  @RequirePermissions('assignments:manage')
  @Post('events/:eventId/assignments')
  assign(
    @Param('eventId') eventId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.assignments.assign(
      parseOrThrow(uuidSchema, eventId),
      auth,
      ipOf(req),
      parseOrThrow(createAssignmentSchema, body),
    );
  }

  @RequirePermissions('assignments:manage')
  @Delete('events/:eventId/assignments/:assignmentId')
  @HttpCode(204)
  async remove(
    @Param('eventId') eventId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { reason } = parseOrThrow(removeAssignmentSchema, body ?? {});
    await this.assignments.remove(
      parseOrThrow(uuidSchema, eventId),
      parseOrThrow(uuidSchema, assignmentId),
      auth,
      ipOf(req),
      reason,
    );
  }

  @RequirePermissions('assignments:read_own')
  @Get('assignments/mine')
  mine(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.assignments.mine(
      auth,
      parseOrThrow(myAssignmentsQuerySchema, query),
    );
  }

  @RequirePermissions('assignments:read_own')
  @Post('assignments/:id/respond')
  @HttpCode(200)
  respond(
    @Param('id') id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Body() body: unknown,
  ) {
    return this.assignments.respond(
      parseOrThrow(uuidSchema, id),
      auth,
      ipOf(req),
      parseOrThrow(respondAssignmentSchema, body),
    );
  }
}
