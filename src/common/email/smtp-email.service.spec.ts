import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MembershipRequestEmailService } from '../../membership-requests/membership-request-email.service.js';
import { SmtpEmailService } from './smtp-email.service.js';

const relay = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn(), close: vi.fn() }));
vi.mock('nodemailer', () => ({ default: relay }));

function smtp(port: number) {
  return new SmtpEmailService(new ConfigService({
    SMTP_HOST: 'mail.example.test', SMTP_PORT: port, SMTP_USER: 'fixture', SMTP_PASS: 'fixture',
    AUTH_EMAIL_FROM: 'sender@example.test',
  }));
}

afterEach(() => vi.restoreAllMocks());

describe('SMTP submission and membership delivery', () => {
  it.each([465, 587, 2525])('requires verified TLS on port %i', async (port) => {
    relay.createTransport.mockReturnValue(relay);
    await smtp(port).sendMail({});
    expect(relay.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      secure: port === 465, requireTLS: port !== 465, tls: { rejectUnauthorized: true },
    }));
  });

  it('logs only the outcome, skip reason and opaque ID for membership mail', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    relay.createTransport.mockReturnValue(relay);
    const mail = new MembershipRequestEmailService(smtp(465));
    const email = { to: 'person@example.test', recipientName: 'Sample Person', decision: 'APPROVED', committeeName: 'Sample Committee' } as const;
    await mail.sendDecisionEmail(email);
    const [payload] = relay.sendMail.mock.lastCall!;
    expect(payload.text).toContain('Hello,');
    expect(payload.html).toContain('مرحبًا،');
    expect(JSON.stringify(payload)).not.toContain('Sample Person');
    await mail.sendDecisionEmail({ ...email, to: null });
    const deliveryId = expect.stringMatching(/^[0-9a-f-]{36}$/);
    expect(log).toHaveBeenCalledWith({ event: 'membership_decision_email_sent', deliveryId });
    expect(warn).toHaveBeenCalledWith({ event: 'membership_decision_email_skipped', reason: 'NO_EMAIL_ADDRESS', deliveryId });
  });
});
