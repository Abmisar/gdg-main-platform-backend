import { AuditRead } from '../prisma/read-audit.js';
import { captureConsent } from '../data-rights/consent.js';
import type { Request } from 'express';
import {
  Req, Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthRequiredGuard,
  type AuthenticatedUser,
  CurrentUser,
} from '../auth/current-user.js';
import { apiSuccess } from '../common/http/api-response.js';
import {
  CreateMembershipRequestDto,
  DecideMembershipRequestDto,
  ListMembershipRequestsQueryDto,
  MembershipRequestCommitteeParamDto,
} from './membership-request.dto.js';
import { MembershipRequestService } from './membership-request.service.js';
import { VerifiedEmailGuard } from './verified-email.guard.js';

function memberIdOf(user: AuthenticatedUser) {
  if (!user.memberId) {
    // Authenticated non-members may submit their request; this helper is only
    // used by review routes, where lacking a member record means no permission.
    throw new ForbiddenException();
  }
  return user.memberId;
}

@Controller('membership-requests')
@UseGuards(AuthRequiredGuard)
export class MembershipRequestsController {
  constructor(
    @Inject(MembershipRequestService)
    private readonly requests: MembershipRequestService,
  ) {}

  @Get('leadership')
  @AuditRead('applications.leadership', 'array')
  async listLeadership(
    @Query('scope') scope: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (scope !== 'CLUB' && scope !== 'DEVELOPER_COMMITTEES') throw new ForbiddenException();
    return apiSuccess(await this.requests.listLeadership(scope, user));
  }

  @Post()
  @UseGuards(VerifiedEmailGuard)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Body() body: CreateMembershipRequestDto,
  ) {
    return apiSuccess(await this.requests.create(user, body, captureConsent(body.consent, request, ['membership'])), 'Membership request submitted.');
  }

  @Get()
  @AuditRead('applications.committee', 'array')
  async list(
    @Query() query: ListMembershipRequestsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return apiSuccess(await this.requests.list(query.committeeCode, memberIdOf(user)));
  }

  @Patch(':requestId/committees/:committeeCode')
  @AuditRead('applications.decide-committee', 'single')
  async decide(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param() params: MembershipRequestCommitteeParamDto,
    @Body() body: DecideMembershipRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return apiSuccess(
      await this.requests.decide(requestId, params.committeeCode, body.decision, user),
      'Membership request decision saved.',
    );
  }

  @Patch(':requestId/leadership/committees/:committeeCode')
  @AuditRead('applications.decide-leadership-committee', 'single')
  async decideLeadershipCommittee(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param() params: MembershipRequestCommitteeParamDto,
    @Body() body: DecideMembershipRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return apiSuccess(await this.requests.decideLeadershipCommittee(requestId, params.committeeCode, body.decision, user));
  }

  @Patch(':requestId/leadership/global-roles/:roleCode')
  @AuditRead('applications.decide-global-role', 'single')
  async decideGlobalRole(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('roleCode') roleCode: string,
    @Body() body: DecideMembershipRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return apiSuccess(await this.requests.decideGlobalRole(requestId, roleCode, body.decision, user));
  }
}
