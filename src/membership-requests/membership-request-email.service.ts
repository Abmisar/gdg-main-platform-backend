import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SmtpEmailService } from '../common/email/smtp-email.service.js';

export type MembershipDecisionEmailKind = 'APPROVED' | 'REJECTED';

export interface MembershipDecisionEmail {
  to: string | null;
  decision: MembershipDecisionEmailKind;
  committeeName?: string;
  globalRoleName?: string;
  roleName?: string;
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

@Injectable()
export class MembershipRequestEmailService {
  private readonly logger = new Logger(MembershipRequestEmailService.name);

  constructor(
    @Inject(SmtpEmailService) private readonly smtp: SmtpEmailService,
  ) {}

  async sendDecisionEmail(email: MembershipDecisionEmail): Promise<void> {
    const deliveryId = randomUUID();
    if (!email.to) {
      this.logger.warn({
        event: 'membership_decision_email_skipped',
        reason: 'NO_EMAIL_ADDRESS',
        deliveryId,
      });
      return;
    }

    const from = this.smtp.getFromAddress();
    if (!from || !this.smtp.isConfigured()) {
      this.logger.warn({
        event: 'membership_decision_email_skipped',
        reason: 'SMTP_NOT_CONFIGURED',
        deliveryId,
      });
      return;
    }

    const isCommitteeDecision = Boolean(email.committeeName);
    const targetName =
      email.committeeName ?? email.globalRoleName ?? 'الدور المطلوب';
    const targetNameEn =
      email.committeeName ?? email.globalRoleName ?? 'requested role';
    const roleName =
      email.roleName === 'Member'
        ? 'عضو'
        : email.roleName === 'Leader'
          ? 'قائد'
          : email.roleName === 'Co-Leader'
            ? 'نائب قائد'
            : email.roleName;
    const roleNameEn =
      email.roleName === 'Member'
        ? 'Member'
        : email.roleName === 'Leader'
          ? 'Leader'
          : email.roleName === 'Co-Leader'
            ? 'Co-Leader'
            : email.roleName;
    const committeeRoleDescriptor = roleName ? ` كـ${roleName}` : '';
    const committeeRoleDescriptorEn = roleNameEn ? ` as a ${roleNameEn}` : '';
    const subjectAr =
      email.decision === 'APPROVED'
        ? isCommitteeDecision
          ? `مُبارك تم قبولك في ${targetName} !✨`
          : 'مُبارك تم قبولك! ✨'
        : 'تحديث بخصوص طلب انضمامك إلى مجموعة مطوّري جوجل بجامعة جدة';
    const subjectEn =
      email.decision === 'APPROVED'
        ? isCommitteeDecision
          ? `Congratulations You’ve Been Accepted to ${targetNameEn} ✨`
          : 'Congratulations You’ve Been Accepted! ✨'
        : `An Update on Your Application to Google Developer Groups on Campus | University of Jeddah`;
    const greetingAr = 'مرحبًا،';
    const greetingEn = 'Hello,';
    const bodyAr =
      email.decision === 'APPROVED'
        ? isCommitteeDecision
          ? `يُسعدنا إبلاغك بأنه تم قبولك في لجنة ${targetName}${committeeRoleDescriptor}! 🎈\n\nسعداء بانضمامك إلى مجموعتنا، ونؤمن بأن شغفك وأفكارك ستكون إضافة مميزة للجنة، ونتطلع إلى ما ستقدّمه من إبداع، وإلى ما سنحققه معًا من خطوات وإنجازات مميزة💡`
          : `يُسعدنا إبلاغك بأنه تم قبولك كـ ${targetName}! 🎈\n\nسعداء بانضمامك إلى مجموعتنا، ونؤمن بأن شغفك وأفكارك ستكون إضافة مميزة لفريقنا، ونتطلع إلى ما ستقدّمه من إبداع، وإلى ما سنحققه معًا من خطوات وإنجازات مميزة💡`
        : `شكرًا لاهتمامك بالتسجيل في مجموعة مطوّري جوجل بجامعة جدة${isCommitteeDecision ? committeeRoleDescriptor : ` كـ${targetName}`}، ورغبتك في أن تكون جزءًا من رحلتنا\n\nبعد مراجعة طلبات التسجيل، نعتذر عن عدم تمكّنك من الانضمام إلى المجموعة في هذا الفصل الدراسي، وذلك لا يقلل من قدراتك أو شغفك، وإنما جاء نتيجة محدودية المقاعد وكثرة الطلبات\n\nلكن رحلتك معنا لا تتوقف هُنا! ✨\nيُسعدنا حضورك في ورشنا وفعالياتنا القادمة، والاستفادة من التجارب والفرص التي نقدمها`;
    const bodyEn =
      email.decision === 'APPROVED'
        ? isCommitteeDecision
          ? `We’re delighted to inform you that you have been accepted into the ${targetNameEn} Committee${committeeRoleDescriptorEn}! 🎈\n\nWe’re excited to welcome you to our community, We believe your passion and ideas will be a valuable addition to the committee, and we look forward to seeing the creativity you bring and the milestones and achievements we’ll accomplish together. 💡`
          : `We’re delighted to inform you that you have been accepted as ${targetNameEn}! 🎈\n\nWe’re excited to welcome you to our community, We believe your passion and ideas will be a valuable addition to our team, and we look forward to seeing the creativity you bring and the milestones and achievements we’ll accomplish together. 💡`
        : `Thank you for your interest in joining Google Developer Groups on Campus, University of Jeddah${isCommitteeDecision ? ` as a ${roleNameEn ?? 'member'} of the ${targetNameEn} Committee` : ` as a ${targetNameEn}`}, and for your desire to be part of our journey\n\nAfter carefully reviewing the applications, we regret to inform you that we are unable to offer you a place in the community this semester. This decision does not reflect your abilities or passion, but is due to the limited number of available spots and the high volume of applications received\n\nHowever, your journey with us doesn’t end here! ✨\n\nWe’d be delighted to welcome you to our upcoming workshops and events, where you can continue learning and benefit from the experiences and opportunities we offer`;

    const subject = `${subjectAr} | ${subjectEn}`;
    const htmlBodyAr = escapeHtml(bodyAr).replace(/\n/g, '<br>');
    const htmlBodyEn = escapeHtml(bodyEn).replace(/\n/g, '<br>');
    const footerAr = 'مع خالص التمنيات بالتوفيق،';
    const footerEn = 'Kind regards,';
    const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f8f9fa;font-family:Arial,Tahoma,sans-serif;color:#202124;line-height:1.9"><div style="max-width:600px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e8eaed;border-radius:16px"><section dir="rtl" style="text-align:right"><h2 style="margin-top:0;color:#1a73e8">${escapeHtml(subjectAr)}</h2><p>${escapeHtml(greetingAr)}</p><p>${htmlBodyAr}</p><p style="margin-top:28px">${footerAr}<br><strong>مجموعة مطوّري جوجل بجامعة جدة</strong></p></section><hr style="border:0;border-top:1px solid #e8eaed;margin:28px 0"><section dir="ltr" style="text-align:left"><h2 style="margin-top:0;color:#1a73e8">${escapeHtml(subjectEn)}</h2><p>${escapeHtml(greetingEn)}</p><p>${htmlBodyEn}</p><p style="margin-top:28px">${footerEn}<br><strong>Google Developer Group on Campus, University of Jeddah</strong></p></section></div></body></html>`;
    const text = `${subjectAr}\n${greetingAr}\n\n${bodyAr}\n\n${footerAr}\nمجموعة مطوّري جوجل بجامعة جدة\n\n---\n\n${subjectEn}\n${greetingEn}\n\n${bodyEn}\n\n${footerEn}\nGoogle Developer Group on Campus, University of Jeddah`;

    await this.smtp.sendMail({ from, to: email.to, subject, text, html });
    this.logger.log({
      event: 'membership_decision_email_sent',
      deliveryId,
    });
  }
}
