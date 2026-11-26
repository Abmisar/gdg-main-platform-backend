import { type ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnnouncementsController } from '../src/announcements/announcements.controller.js';
import { AnnouncementsService } from '../src/announcements/announcements.service.js';
import { CommitteeDashboardController } from '../src/committee-dashboard/committee-dashboard.controller.js';
import { CommitteeDashboardService } from '../src/committee-dashboard/committee-dashboard.service.js';
import { LeadershipTasksService } from '../src/committee-dashboard/leadership-tasks.service.js';
import { ImageUploadLengthGuard, MAX_IMAGE_REQUEST_BYTES } from '../src/common/http/image-upload.js';

describe('image upload routes', () => {
  let app: INestApplication;
  const requireManager = vi.fn();
  const requireEventImagePermission = vi.fn();
  const uploadImage = vi.fn();
  const uploadEventImage = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AnnouncementsController, CommitteeDashboardController],
      providers: [
        { provide: AnnouncementsService, useValue: { requireManager, uploadImage } },
        { provide: CommitteeDashboardService, useValue: { requireEventImagePermission, uploadEventImage } },
        { provide: LeadershipTasksService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
      if (req.headers['x-test-member']) req.user = { personId: 1, memberId: 2 };
      next();
    });
    await app.init();
  });

  afterAll(async () => app.close());

  it.each([
    { path: '/announcements/images', permission: requireManager, upload: uploadImage },
    { path: '/committees/PR/events/images', permission: requireEventImagePermission, upload: uploadEventImage },
  ])('authenticates and authorizes before parsing at $path', async ({ path, permission, upload }) => {
    await request(app.getHttpServer()).post(path).attach('file', Buffer.from('GIF89a'), 'sample.gif').expect(401);
    permission.mockRejectedValueOnce(new ForbiddenException());
    await request(app.getHttpServer()).post(path).set('x-test-member', '1').field('caption', 'sample').expect(403);
    expect(upload).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post(path).set('x-test-member', '1').field('caption', 'sample').expect(400);
    await request(app.getHttpServer()).post(path).set('x-test-member', '1').attach('file', Buffer.from('GIF89a'), 'sample.gif').expect(201);
    expect(upload.mock.lastCall?.at(-1)).toMatchObject({ mimetype: 'image/gif', size: 6 });
  });
});

describe('image upload envelope', () => {
  function checkLength(headers: Request['headers']) {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
    return new ImageUploadLengthGuard().canActivate(context);
  }

  it('accepts the exact documented envelope and rejects sizes above it', () => {
    expect(checkLength({ 'content-length': String(MAX_IMAGE_REQUEST_BYTES) })).toBe(true);
    expect(() => checkLength({ 'content-length': String(MAX_IMAGE_REQUEST_BYTES + 1) })).toThrow(
      expect.objectContaining({ status: 413 }),
    );
  });

  it('requires a known body length', () => {
    expect(() => checkLength({})).toThrow(expect.objectContaining({ status: 411 }));
    expect(() => checkLength({ 'transfer-encoding': 'chunked' })).toThrow(expect.objectContaining({ status: 411 }));
  });
});
