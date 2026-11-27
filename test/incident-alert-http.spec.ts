import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { BetterAuthService } from '../src/auth/better-auth.service.js';
import { SmtpEmailService } from '../src/common/email/smtp-email.service.js';
import { configureHttp } from '../src/configure-http.js';
import { CheckInService } from '../src/registrations/check-in.service.js';
import { RegistrationEmailDeliveryService } from '../src/registrations/registration-email-delivery.service.js';
import { RegistrationListService } from '../src/registrations/registration-list.service.js';
import { RegistrationReviewService } from '../src/registrations/registration-review.service.js';
import { RegistrationsController } from '../src/registrations/registrations.controller.js';

it('counts encoded event IDs at the matched report and registration-list handlers', async () => {
  const sendMail = vi.fn().mockResolvedValue(undefined);
  const list = vi.fn().mockResolvedValue([]);
  const fixture = await Test.createTestingModule({
    controllers: [RegistrationsController],
    providers: [
      { provide: BetterAuthService, useValue: { auth: {} } },
      { provide: SmtpEmailService, useValue: { sendMail, isConfigured: () => true, getFromAddress: () => 'sender@example.test' } },
      { provide: RegistrationListService, useValue: { list, getDataEventReport: list } },
      ...[RegistrationReviewService, CheckInService, RegistrationEmailDeliveryService].map(provide => ({ provide, useValue: {} })),
    ],
  }).compile();
  const app = fixture.createNestApplication<NestExpressApplication>({ logger: false });
  vi.stubEnv('SECURITY_ALERT_EMAIL', 'security@example.test');
  try {
    configureHttp(app);
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { personId: 1, memberId: 1 };
      next();
    });
    await app.init();
    const http = request(app.getHttpServer());
    for (const [path, threshold, signal] of [
      ['/data/event-reports/events/%31?group=all', 5, 'reportRead'],
      ['/events/%31/registrations', 60, 'staffRead'],
    ] as const) {
      sendMail.mockClear();
      for (let i = 1; i < threshold; i++) await http.get(path).expect(200);
      expect(sendMail).not.toHaveBeenCalled();
      await http.get(path).expect(200);
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(signal) }));
    }
  } finally {
    vi.unstubAllEnvs();
    await app.close();
  }
});
