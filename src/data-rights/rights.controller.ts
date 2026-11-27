import {
  Body,
  Controller,
  PreconditionFailedException,
  Headers,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { RequestUser } from '../auth/auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.js';
import { AuthRateLimit, PersonRateLimitGuard } from '../auth/auth-rate-limit.guard.js';
import { apiSuccess } from '../common/http/api-response.js';
import type { Request } from 'express';
import {
  captureConsent,
  ConsentSubmission,
  documentVersions,
} from './consent.js';
import {
  CorrectProfileDto,
  ManualRequestDto,
  ResolveRequestDto,
  SubjectRequestDto,
} from './rights.dto.js';
import { RightsService } from './rights.service.js';

function boundPerson(user: AuthenticatedUser, expected: string | undefined) {
  if (expected !== undefined && expected !== String(user.personId)) {
    throw new PreconditionFailedException('The signed-in account changed.');
  }
  return user.personId;
}

@Controller()
export class RightsController {
  constructor(@Inject(RightsService) private readonly rights: RightsService) {}

  @Get('me/privacy-identity')
  identity(@CurrentUser() user: AuthenticatedUser, @Req() request: Request & { user?: RequestUser }) {
    const sessionId = request.user?.sessionId;
    if (!sessionId) throw new UnauthorizedException();
    return apiSuccess({ personId: user.personId, sessionId });
  }

  @Get('consent/documents')
  versions() {
    return apiSuccess(documentVersions);
  }

  @Get('me/consent')
  async consentStatus(@CurrentUser() user: AuthenticatedUser, @Headers('x-gdg-expected-person') expected?: string) {
    return apiSuccess(await this.rights.consentStatus(boundPerson(user, expected)));
  }

  @Post('me/consent')
  @AuthRateLimit({
    scope: 'consent-renewal',
    dimension: 'ip',
    limit: 30,
    windowSeconds: 3600,
  })
  async acceptConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Body() body: ConsentSubmission,
    @Headers('x-gdg-expected-person') expected?: string,
  ) {
    return apiSuccess(
      await this.rights.acceptConsent(
        boundPerson(user, expected),
        captureConsent(body.consent, request, ['renewal']),
      ),
    );
  }

  @Get('me/export')
  @AuthRateLimit({
    scope: 'rights-export',
    dimension: 'ip',
    limit: 5,
    windowSeconds: 3600,
  })
  async export(@CurrentUser() user: AuthenticatedUser, @Headers('x-gdg-expected-person') expected?: string) {
    return apiSuccess(await this.rights.export(boundPerson(user, expected)));
  }

  @Patch('me/profile')
  async correct(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CorrectProfileDto,
    @Headers('x-gdg-expected-person') expected?: string,
  ) {
    return apiSuccess(await this.rights.correct(boundPerson(user, expected), input));
  }

  @Get('me/data-requests')
  @UseGuards(PersonRateLimitGuard)
  @AuthRateLimit(
    { scope: 'rights-list', dimension: 'ip', limit: 240, windowSeconds: 3600 },
    { scope: 'rights-list', dimension: 'person', limit: 60, windowSeconds: 3600 },
  )
  async ownRequests(@CurrentUser() user: AuthenticatedUser, @Headers('x-gdg-expected-person') expected?: string) {
    return apiSuccess(await this.rights.ownRequests(boundPerson(user, expected)));
  }

  @Post('me/data-requests')
  @UseGuards(PersonRateLimitGuard)
  @AuthRateLimit(
    { scope: 'rights-submit', dimension: 'ip', limit: 50, windowSeconds: 86400 },
    { scope: 'rights-submit', dimension: 'person', limit: 5, windowSeconds: 86400 },
  )
  async submitRequest(@CurrentUser() user: AuthenticatedUser, @Body() input: SubjectRequestDto, @Headers('x-gdg-expected-person') expected?: string) {
    return apiSuccess(await this.rights.submitRequest(boundPerson(user, expected), input));
  }

  @Get('me/deletion')
  @UseGuards(PersonRateLimitGuard)
  @AuthRateLimit(
    { scope: 'rights-deletion-status', dimension: 'ip', limit: 240, windowSeconds: 3600 },
    { scope: 'rights-deletion-status', dimension: 'person', limit: 60, windowSeconds: 3600 },
  )
  async deletionStatus(@CurrentUser() user: AuthenticatedUser, @Headers('x-gdg-expected-person') expected?: string) {
    return apiSuccess(await this.rights.deletionStatus(boundPerson(user, expected)));
  }

  @Post('me/deletion')
  async requestDeletion(@CurrentUser() user: AuthenticatedUser, @Headers('x-gdg-expected-person') expected?: string) {
    return apiSuccess(await this.rights.requestDeletion(boundPerson(user, expected)));
  }

  @Delete('me/deletion')
  async cancelDeletion(@CurrentUser() user: AuthenticatedUser, @Headers('x-gdg-expected-person') expected?: string) {
    await this.rights.cancelDeletion(boundPerson(user, expected));
    return apiSuccess(null);
  }

  @Post('leadership/data-requests')
  async log(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ManualRequestDto,
  ) {
    return apiSuccess(await this.rights.logManual(user, input));
  }

  @Get('leadership/data-requests')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return apiSuccess(await this.rights.listManual(user));
  }

  @Patch('leadership/data-requests/:id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() input: ResolveRequestDto,
  ) {
    await this.rights.updateManual(user, id, input);
    return apiSuccess(null);
  }
}
