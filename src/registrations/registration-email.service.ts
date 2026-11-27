import { ConfigService } from '@nestjs/config';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SmtpEmailService } from '../common/email/smtp-email.service.js';

export type RegistrationEmailKind =
  'ACCEPTED' | 'REJECTED' | 'WAITLISTED' | 'PROMOTED' | 'CONFIRMED';

export interface RegistrationEmail {
  kind: RegistrationEmailKind;
  registrationId: number;
  to: string | null;
  recipientName: string;
  eventName: string;
  // Set for ACCEPTED and PROMOTED: the member must confirm before this time.
  confirmationDeadline?: Date;
  // Set for CONFIRMED: inline QR and a PNG attachment are sent to the member.
  attendanceQrCodeDataUrl?: string | null;
  whatsappGroupLink?: string | null;
  eventStartsAt?: Date;
  eventType?: string | null;
  eventLocation?: string | null;
  eventMapsLink?: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

function formatDate(date: Date, locale: 'en' | 'ar'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Riyadh',
  }).format(date);
}

const EVENT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  Workshop: { ar: 'ورشة عمل', en: 'Workshop' },
  Conference: { ar: 'مؤتمر', en: 'Conference' },
  Talk: { ar: 'محاضرة', en: 'Talk' },
  Panel: { ar: 'جلسة حوارية', en: 'Panel' },
  Hackathon: { ar: 'هاكاثون', en: 'Hackathon' },
  Trip: { ar: 'رحلة', en: 'Trip' },
};

function eventTypeLabel(
  type: string | null | undefined,
  locale: 'ar' | 'en',
): string | null {
  return type ? (EVENT_TYPE_LABELS[type]?.[locale] ?? type) : null;
}

function eventDisplayName(
  name: string,
  type: string | null | undefined,
  locale: 'ar' | 'en',
): string {
  const label = eventTypeLabel(type, locale);
  return label ? `${label} «${name}»` : name;
}

function safeWhatsAppGroupInvite(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'chat.whatsapp.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      (url.search &&
        !/^\?[A-Za-z0-9._~!$&()*+,;=:@\/?%-]{1,400}$/.test(url.search)) ||
      !/^\/[A-Za-z0-9_-]{8,128}\/?$/.test(url.pathname)
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

@Injectable()
export class RegistrationEmailService {
  private readonly logger = new Logger(RegistrationEmailService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SmtpEmailService) private readonly smtp: SmtpEmailService,
  ) {}

  async send(email: RegistrationEmail): Promise<void> {
    if (!email.to) {
      this.logger.warn({
        event: 'registration_email_skipped',
        reason: 'NO_EMAIL_ADDRESS',
        kind: email.kind,
        registrationId: email.registrationId,
      });
      return;
    }

    const from = this.config.get<string>('AUTH_EMAIL_FROM');
    if (!this.smtp.isConfigured() || !from) {
      throw new ServiceUnavailableException(
        'Event email delivery is not configured.',
      );
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const eventUrl = new URL('/en/registrations', frontendUrl).toString();
    const eventNameAr = eventDisplayName(
      email.eventName,
      email.eventType,
      'ar',
    );
    const eventNameEn = eventDisplayName(
      email.eventName,
      email.eventType,
      'en',
    );
    const whatsappGroupLink =
      email.kind === 'CONFIRMED'
        ? safeWhatsAppGroupInvite(email.whatsappGroupLink)
        : undefined;
    const requiresResponse =
      (email.kind === 'ACCEPTED' || email.kind === 'PROMOTED') &&
      !!email.confirmationDeadline;
    const hasRegistrationLink = requiresResponse || email.kind === 'WAITLISTED';
    const usesEventDetails =
      email.kind === 'CONFIRMED' ||
      (email.kind === 'PROMOTED' && requiresResponse);
    const detailLines = (locale: 'ar' | 'en') =>
      [
        email.confirmationDeadline
          ? locale === 'ar'
            ? `آخر موعد لتأكيد الحضور: ${formatDate(email.confirmationDeadline, locale)}`
            : `Attendance Confirmation Deadline: ${formatDate(email.confirmationDeadline, locale)}`
          : '',
        email.eventStartsAt
          ? locale === 'ar'
            ? `${usesEventDetails ? (email.eventType === 'Workshop' ? 'تاريخ الورشة' : 'تاريخ الفعالية') : email.eventType === 'Workshop' ? 'موعد الورشة' : email.eventType ? `موعد ${eventTypeLabel(email.eventType, locale)}` : 'الموعد'}: ${formatDate(email.eventStartsAt, locale)}`
            : `${usesEventDetails ? 'Event Date' : eventTypeLabel(email.eventType, locale) ? `${eventTypeLabel(email.eventType, locale)} Date` : 'Date'}: ${formatDate(email.eventStartsAt, locale)}`
          : '',
        email.eventLocation
          ? locale === 'ar'
            ? `${usesEventDetails ? 'المكان' : 'الموقع'}: ${email.eventLocation}`
            : `Location: ${email.eventLocation}`
          : '',
        email.eventMapsLink
          ? locale === 'ar'
            ? `رابط الموقع: ${email.eventMapsLink}`
            : `Location link: ${email.eventMapsLink}`
          : '',
      ].filter(Boolean);
    const detailsAr = detailLines('ar');
    const detailsEn = detailLines('en');
    const attachments: {
      filename: string;
      content: Buffer;
      contentType: string;
      cid?: string;
    }[] = [];
    let qrHtml = '';
    const includeQr =
      email.kind === 'CONFIRMED' && email.attendanceQrCodeDataUrl !== null;
    if (includeQr) {
      const match = email.attendanceQrCodeDataUrl?.match(
        /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!match) throw new Error('Attendance QR image is missing or invalid.');
      attachments.push({
        filename: 'event-attendance-qr.png',
        content: Buffer.from(match[1], 'base64'),
        contentType: 'image/png',
        cid: 'event-attendance-qr',
      });
      qrHtml =
        '<p style="text-align:center"><img src="cid:event-attendance-qr" alt="Event attendance QR code / رمز QR للحضور" width="240" height="240"></p>';
    }

    const acceptanceAr = `يُسعدنا إبلاغك بقبولك في ${eventNameAr}، ضمن محطات آفـاق مجموعة مطوّري جوجل بجامعة جدة✨`;
    const acceptanceEn = `We are pleased to inform you that your application to participate in the ${eventNameEn}, part of the Google Developer Groups University of Jeddah Afaq Series, has been accepted! ✨`;
    const wishesAr = 'نتمنى لك تجربة مليئة بالمعرفة والتطبيق! ✨';
    const wishesEn =
      'We wish you an enriching experience filled with learning and hands on practice! ✨';
    const afaqWishesAr =
      'نترقّب لقاءك في محطات آفـاق، ونتمنى لك تجربة مليئة بالمعرفة والتطبيق! ✨';
    const copy = {
      ACCEPTED: {
        ar: {
          subject: requiresResponse
            ? `مُبارك قبولك في ${eventNameAr}، أكّد حضورك`
            : 'مُبارك تم قبول تسجيلك وإرسال بطاقة العضوية',
          body: [
            acceptanceAr,
            requiresResponse
              ? 'نترقّب مشاركتك معنا، ونرجو تأكيد حضورك قبل انتهاء المهلة المحددة لضمان مقعدك!'
              : 'نترقّب مشاركتك معنا، ونرجو إحضار بطاقة العضوية الخاصة بك وإبرازها عند الوصول لتسجيل حضورك',
          ],
          closing: [
            ...(requiresResponse
              ? [
                  'بعد تأكيد حضورك، ستصلك رسالة تتضمن تفاصيل تأكيد التسجيل وبطاقة العضوية',
                ]
              : []),
            wishesAr,
          ],
        },
        en: {
          subject: requiresResponse
            ? `Congratulations on Your Acceptance to ${eventNameEn}, Confirm Your Attendance`
            : 'Congratulations Your Registration Has Been Accepted and Your Membership Card Has Been Sent',
          body: [
            acceptanceEn,
            requiresResponse
              ? 'We look forward to having you with us. Kindly confirm your attendance before the specified deadline to secure your spot.'
              : 'We look forward to having you with us, Please make sure to bring your membership card and present it upon arrival to confirm your attendance',
          ],
          closing: [
            ...(requiresResponse
              ? [
                  'After confirming your attendance, you will receive an email containing your registration confirmation details and membership card',
                ]
              : []),
            wishesEn,
          ],
        },
      },
      PROMOTED: {
        ar: {
          subject: requiresResponse
            ? `هناك مقعد متاح في ${eventNameAr}، أكّد حضورك`
            : 'تم تأكيد حضورك!✨',
          body: requiresResponse
            ? [
                `أصبح هناك مقعد متاح لك في ${eventNameAr} ضمن محطات آفـاق مجموعة مطوّري جوجل بجامعة جدة!✨`,
                'نرجو تأكيد حضورك قبل انتهاء المهلة المحددة لضمان مقعدك!',
              ]
            : [
                `يُسعدنا تأكيد حجز مقعدك في ${eventNameAr}، ضمن محطات آفـاق مجموعة مطوّري جوجل بجامعة جدة✨`,
                'أصبح مقعدك مؤكدًا، ونترقّب مشاركتك معنا في هذه التجربة🎈',
                'نرجو إحضار بطاقة العضوية الخاصة بك وإبرازها عند الوصول لتسجيل حضورك',
              ],
          closing: [requiresResponse ? afaqWishesAr : wishesAr],
        },
        en: {
          subject: requiresResponse
            ? `A Place Is Available at ${eventNameEn} – Confirm Your Attendance`
            : 'Attendance Is Confirmed! ✨',
          body: requiresResponse
            ? [
                `A place has become available for you at ${eventNameEn}, one of the Afaq series events organized by Google Developer Group on Campus, University of Jeddah! ✨`,
                'Please confirm your attendance before the deadline to secure your spot',
              ]
            : [
                `We are pleased to confirm your spot in the ${eventNameEn}, part of the Afaq Series by Google Developer Groups University of Jeddah! ✨`,
                'Your seat is now secured, and we look forward to having you join us for this experience! 🎈',
                'Please remember to bring your membership card and present it upon arrival to check in',
              ],
          closing: [
            requiresResponse
              ? 'We look forward to seeing you at Afaq and wish you an enriching experience filled with learning and hands on activities! ✨'
              : wishesEn,
          ],
        },
      },
      REJECTED: {
        ar: {
          subject: `بخصوص طلب تسجيلك في ${eventNameAr}`,
          body: [
            `نؤمن بأن لكل موهبة فرصة تستحقها، ونقدّر شغفك وحرصك على تطوير مهاراتك، ونعتذر عن عدم قبول تسجيلك في هذه ${email.eventType === 'Workshop' ? 'الورشة' : 'الفعالية'}، نظرًا لمحدودية المقاعد المُتاحة`,
          ],
          closing: [
            'نتطلع إلى لقائك في محطات آفاق القادمة، فطموحك هو ما يفتح آفاقًا جديدة! ✨',
          ],
        },
        en: {
          subject: `Regarding Your Registration for ${eventNameEn}`,
          body: [
            'We believe every talent deserves an opportunity, and we truly appreciate your enthusiasm and dedication to developing your skills.',
            `Unfortunately, we regret to inform you that your registration for this ${email.eventType === 'Workshop' ? 'workshop' : 'event'} has not been accepted due to limited seat availability.`,
          ],
          closing: [
            'We look forward to seeing you at upcoming Afaq events. Your ambition is what opens new horizons! ✨',
          ],
        },
      },
      CONFIRMED: {
        ar: {
          subject: includeQr
            ? `تم تأكيد حضورك في ${eventNameAr}، (QR Code) الخاص بك جاهز`
            : `تم تأكيد حضورك في ${eventNameAr}`,
          body: [
            `يُسعدنا إبلاغك بتأكيد حضورك في ${eventNameAr}، ضمن محطات آفـاق مجموعة مطوّري جوجل بجامعة جدة✨`,
          ],
          closing: [
            ...(includeQr
              ? [
                  'ستجد بطاقة الحضور مرفقة بصيغة PNG، يرجى إبرازها عند المدخل لفريق العلاقات العامة',
                ]
              : []),
            afaqWishesAr,
          ],
        },
        en: {
          subject: includeQr
            ? `Your Attendance at ${eventNameEn} Is Confirmed, Your QR Code Is Ready`
            : `Your Attendance at ${eventNameEn} Is Confirmed`,
          body: [
            `We’re pleased to confirm your attendance at ${eventNameEn}, one of the Afaq series events organized by Google Developer Group on Campus, University of Jeddah ✨`,
          ],
          closing: [
            ...(includeQr
              ? [
                  'Your attendance pass is attached as a PNG file. Please present it to the PR team at the event entrance',
                ]
              : []),
            'We look forward to seeing you at Afaq! Wishing you an enriching experience filled with learning and hands-on activities ✨',
          ],
        },
      },
      WAITLISTED: {
        ar: {
          subject: `تمت إضافتك إلى قائمة الانتظار لـ${eventNameAr}`,
          body: [
            `تمت إضافتك إلى قائمة الانتظار لـ${eventNameAr} ضمن محطات آفاق مجموعة مطوّري جوجل بجامعة جدة. سنرسل إليك رسالة إذا توفر مقعد، ونرجو متابعة بريدك الإلكتروني لمعرفة أي تحديثات.`,
          ],
          closing: [],
        },
        en: {
          subject: `You’re on the Waitlist for ${eventNameEn}`,
          body: [
            `You have been added to the waitlist for ${eventNameEn}, part of the Afaq series by Google Developer Group on Campus, University of Jeddah. We’ll email you if a place becomes available. Please keep an eye on your inbox for updates.`,
          ],
          closing: [],
        },
      },
    }[email.kind];
    const subject = `${copy.ar.subject} | ${copy.en.subject}`;
    const signoff = {
      ar: 'مع خالص التمنيات بالتوفيق،\nمجموعة مطوّري جوجل بجامعة جدة',
      en: 'Best regards,\nGoogle Developer Group on Campus, University of Jeddah',
    };
    const actionLabel =
      email.kind === 'WAITLISTED'
        ? { ar: 'متابعة حالة التسجيل', en: 'View registration status' }
        : { ar: 'تأكيد الحضور', en: 'Confirm Attendance' };
    const details = { ar: detailsAr, en: detailsEn };
    const locales = ['ar', 'en'] as const;
    const text = locales
      .map((locale) =>
        [
          copy[locale].subject,
          ...copy[locale].body,
          ...(details[locale].length ? [details[locale].join('\n')] : []),
          ...(hasRegistrationLink
            ? [`${actionLabel[locale]}: ${eventUrl}`]
            : []),
          ...copy[locale].closing,
          ...(whatsappGroupLink
            ? [
                `${locale === 'ar' ? 'رابط مجموعة WhatsApp' : 'WhatsApp group'}: ${whatsappGroupLink}`,
              ]
            : []),
          signoff[locale],
        ].join('\n\n'),
      )
      .join('\n\n---\n\n');
    const section = (locale: 'ar' | 'en') => {
      const { subject, body, closing } = copy[locale];
      const paragraphs = (lines: string[]) =>
        lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
      const action = hasRegistrationLink
        ? `<p><a href="${escapeHtml(eventUrl)}">${actionLabel[locale]}</a></p>`
        : '';
      return `<section dir="${locale === 'ar' ? 'rtl' : 'ltr'}" style="text-align:${locale === 'ar' ? 'right' : 'left'}"><h2>${escapeHtml(subject)}</h2>${paragraphs(body)}${paragraphs(details[locale])}${action}${paragraphs(closing)}<p>${escapeHtml(signoff[locale]).replace(/\n/g, '<br>')}</p></section>`;
    };
    const whatsappHtml = whatsappGroupLink
      ? `<p dir="rtl" style="text-align:right"><a href="${escapeHtml(whatsappGroupLink)}" target="_blank" rel="noopener noreferrer">الانضمام إلى مجموعة WhatsApp</a></p><p dir="ltr" style="text-align:left"><a href="${escapeHtml(whatsappGroupLink)}" target="_blank" rel="noopener noreferrer">Join the WhatsApp group</a></p>`
      : '';
    const html = `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Arial,Tahoma,sans-serif;color:#202124;line-height:1.8"><main style="max-width:600px;margin:auto;padding:24px">${section('ar')}<hr style="border:0;border-top:1px solid #dadce0;margin:28px 0">${section('en')}${whatsappHtml}${qrHtml}</main></body></html>`;
    await this.smtp.sendMail(
      {
        from,
        to: email.to,
        subject,
        text,
        html,
        attachments,
      },
      { unavailableMessage: 'Event email delivery is not configured.' },
    );
    this.logger.log({
      event: 'registration_email_sent',
      kind: email.kind,
      registrationId: email.registrationId,
    });
  }
}
