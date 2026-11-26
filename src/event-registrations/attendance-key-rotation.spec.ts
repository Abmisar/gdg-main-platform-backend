import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { SmtpEmailService } from '../common/email/smtp-email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CommitteeAccessService } from '../registrations/committee-access.service.js';
import { RegistrationEmailDeliveryService } from '../registrations/registration-email-delivery.service.js';
import { RegistrationEmailService } from '../registrations/registration-email.service.js';
import type { RegistrationReviewService } from '../registrations/registration-review.service.js';
import { AttendanceTokenService } from './attendance-token.service.js';
import { EventRegistrationService } from './event-registration.service.js';

function tokenService() {
  return new AttendanceTokenService(
    new ConfigService({
      ATTENDANCE_TOKEN_KEY: randomBytes(32).toString('base64'),
    }),
  );
}

describe('attendance key rotation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists registrations with a null QR only for the token encrypted under the previous key', async () => {
    const warning = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const previous = tokenService().issue();
    const tokens = tokenService();
    const current = tokens.issue();
    const event = { startsAt: new Date(Date.now() + 60_000) };
    const registration = { status: 'CONFIRMED', checkedInAt: null, event };
    const prisma = {
      eventRegistration: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...registration,
            registrationId: 1,
            attendanceTokenEncrypted: previous.encrypted,
          },
          {
            ...registration,
            registrationId: 2,
            attendanceTokenEncrypted: current.encrypted,
          },
        ]),
      },
    };
    const service = new EventRegistrationService(
      prisma as unknown as PrismaService,
      tokens,
      {} as RegistrationReviewService,
    );

    expect(await service.myRegistrations(1)).toEqual([
      expect.objectContaining({
        registrationId: 1,
        attendanceQrCodeDataUrl: null,
      }),
      expect.objectContaining({
        registrationId: 2,
        attendanceQrCodeDataUrl: await AttendanceTokenService.qrImage(
          current.token,
        ),
      }),
    ]);
    expect(warning.mock.calls).toEqual([
      [{ event: 'attendance_token_reveal_failed', registrationId: 1 }],
    ]);
  });

  it('delivers a confirmation without an attachment when the previous key is unavailable', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const previous = tokenService().issue();
    const startsAt = new Date(Date.now() + 60_000);
    const prisma = {
      registrationEmailDelivery: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          kind: 'CONFIRMED',
          registration: {
            registrationId: 1,
            status: 'CONFIRMED',
            attendanceTokenEncrypted: previous.encrypted,
            person: { isActive: true, emailPersonal: 'member@example.test' },
            event: {
              name: 'Workshop',
              status: 'PUBLISHED',
              startsAt,
              endsAt: new Date(startsAt.getTime() + 60_000),
            },
          },
        }),
      },
    };
    const smtp = { isConfigured: () => true, sendMail: vi.fn() };
    const email = new RegistrationEmailService(
      new ConfigService({ AUTH_EMAIL_FROM: 'events@example.test' }),
      smtp as unknown as SmtpEmailService,
    );
    const delivery = new RegistrationEmailDeliveryService(
      prisma as unknown as PrismaService,
      email,
      tokenService(),
      {} as CommitteeAccessService,
    );

    await delivery.deliver(1);

    expect(smtp.sendMail).toHaveBeenCalledOnce();
    expect(smtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@example.test',
        attachments: [],
      }),
      expect.any(Object),
    );
    const [[sent]] = smtp.sendMail.mock.calls;
    expect(sent.html).not.toContain('cid:event-attendance-qr');
    expect(sent.subject).toContain('تم تأكيد حضورك في');
    expect(sent.subject).toContain('Is Confirmed');
    for (const output of [sent.subject, sent.text, sent.html]) {
      expect(output).not.toContain('QR Code');
      expect(output).not.toContain('Your attendance pass is attached');
      expect(output).not.toContain('ستجد بطاقة الحضور مرفقة');
    }
    expect(
      prisma.registrationEmailDelivery.updateMany,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { state: 'SENT', leaseExpiresAt: null },
      }),
    );
  });
});
