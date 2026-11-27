import { ConfigService } from '@nestjs/config';
import { expect, it, vi } from 'vitest';
import { ResendAuthEmailService } from './resend-auth-email.service.js';

const send = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'fixture' } }));
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));

it.each(['welcome', 'verification', 'email-change', 'reset', 'password-changed'] as const)(
  'limits %s provider fields to the recipient and rendered message', async kind => {
    const service = new ResendAuthEmailService(new ConfigService({
      RESEND_API_KEY: 'fixture', EMAIL_FROM: 'sender@example.test', FRONTEND_URL: 'https://example.test',
    }));
    const input = {
      kind, locale: 'ar' as const, to: 'recipient@example.test', url: 'https://example.test/action',
      fullName: 'Sample Surname', phone: 'synthetic-phone', tags: ['private-tag'],
    };
    await service.send(input);
    const [payload, options] = send.mock.lastCall!;
    expect(Object.keys(payload).sort()).toEqual(['from', 'html', 'subject', 'text', 'to']);
    expect(options).toBeUndefined();
    expect(JSON.stringify(payload)).not.toMatch(/Sample Surname|synthetic-phone|private-tag/);
  },
);
