import { Body, type CanActivate, Controller, type ExecutionContext, Delete, Get, Inject, Injectable, Param, ParseIntPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ImageUploadInterceptor, ImageUploadLengthGuard } from '../common/http/image-upload.js';
import { AuthRequiredGuard, CurrentUser, type AuthenticatedUser } from '../auth/current-user.js';
import { apiSuccess } from '../common/http/api-response.js';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './announcement.dto.js';
import { AnnouncementsService } from './announcements.service.js';

@Injectable()
export class AnnouncementImageGuard implements CanActivate {
  constructor(@Inject(AnnouncementsService) private readonly announcements: AnnouncementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    await this.announcements.requireManager(user);
    return true;
  }
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(@Inject(AnnouncementsService) private readonly announcements: AnnouncementsService) {}

  @Get()
  async listPublished() {
    return apiSuccess(await this.announcements.listPublished());
  }

  @Get('manage')
  @UseGuards(AuthRequiredGuard)
  async listForManagement(@CurrentUser() user: AuthenticatedUser) {
    return apiSuccess(await this.announcements.listForManagement(user));
  }

  @Post('images')
  @UseGuards(AuthRequiredGuard, AnnouncementImageGuard, ImageUploadLengthGuard)
  @UseInterceptors(ImageUploadInterceptor)
  async uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
  ) {
    return apiSuccess(await this.announcements.uploadImage(user, file));
  }

  @Post()
  @UseGuards(AuthRequiredGuard)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateAnnouncementDto) {
    return apiSuccess(await this.announcements.create(user, body), body.status === 'DRAFT' ? 'Announcement saved as draft.' : 'Announcement published.');
  }

  @Patch(':identifier')
  @UseGuards(AuthRequiredGuard)
  async update(@CurrentUser() user: AuthenticatedUser, @Param('identifier', ParseIntPipe) id: number, @Body() body: UpdateAnnouncementDto) {
    return apiSuccess(await this.announcements.update(user, id, body), 'Announcement updated.');
  }

  @Delete(':identifier')
  @UseGuards(AuthRequiredGuard)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('identifier', ParseIntPipe) id: number) {
    return apiSuccess(await this.announcements.delete(user, id), 'Announcement deleted.');
  }

  @Get(':identifier')
  async getPublished(@Param('identifier') slug: string) {
    return apiSuccess(await this.announcements.getPublished(slug));
  }
}
