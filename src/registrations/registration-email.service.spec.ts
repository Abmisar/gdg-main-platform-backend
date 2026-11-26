import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { SmtpEmailService } from '../common/email/smtp-email.service.js';
import { RegistrationEmailService } from './registration-email.service.js';

describe('registration email rendering', () => {
  const config = {
    get: (key: string) =>
      key === 'AUTH_EMAIL_FROM' ? 'gdg@example.test' : 'https://gdg.example',
  } as ConfigService;
  const registration = {
    registrationId: 42,
    to: 'attendee@example.test',
    recipientName: 'Attendee',
    eventName: 'Afaq',
    eventType: 'Workshop',
  };

  for (const kind of ['ACCEPTED', 'PROMOTED'] as const) {
    it(`${kind} only asks for confirmation when there is a deadline`, async () => {
      const sendMail = vi.fn<SmtpEmailService['sendMail']>();
      const service = new RegistrationEmailService(config, {
        isConfigured: () => true,
        sendMail,
      } as unknown as SmtpEmailService);

      await service.send({ ...registration, kind });
      const [memberCard] = sendMail.mock.calls[0];
      for (const output of [memberCard.text, memberCard.html]) {
        expect(output).toContain('bring your membership card');
        expect(output).toContain('إحضار بطاقة العضوية');
        expect(output).not.toContain('https://gdg.example/en/registrations');
      }

      await service.send({
        ...registration,
        kind,
        confirmationDeadline: new Date('2030-01-01T12:00:00Z'),
      });
      const [offer] = sendMail.mock.calls[1];
      for (const output of [offer.text, offer.html]) {
        expect(output).toContain('Confirm Attendance');
        expect(output).toContain('تأكيد الحضور');
        expect(output).toContain('https://gdg.example/en/registrations');
        expect(output).toContain('2030');
        expect(output).not.toContain('bring your membership card');
      }
    });
  }

  it('keeps the QR attachment and the WhatsApp link on confirmation', async () => {
    const sendMail = vi.fn<SmtpEmailService['sendMail']>();
    const service = new RegistrationEmailService(config, {
      isConfigured: () => true,
      sendMail,
    } as unknown as SmtpEmailService);

    await service.send({
      ...registration,
      kind: 'CONFIRMED',
      attendanceQrCodeDataUrl: 'data:image/png;base64,AAAA',
      whatsappGroupLink: 'https://chat.whatsapp.com/example-group',
    });
    const [confirmation] = sendMail.mock.calls[0];
    expect(confirmation.subject).toContain('Your QR Code Is Ready');
    expect(confirmation.attachments).toMatchObject([
      { filename: 'event-attendance-qr.png', contentType: 'image/png' },
    ]);
    expect(confirmation.html).toContain('cid:event-attendance-qr');
    for (const output of [confirmation.text, confirmation.html]) {
      expect(output).toContain('https://chat.whatsapp.com/example-group');
      expect(output).not.toContain('Apple Wallet');
    }
  });
});
