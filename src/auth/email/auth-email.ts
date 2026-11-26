export const AUTH_EMAIL_KINDS = [
  'verification',
  'reset',
  'welcome',
  'email-change',
  'password-changed',
] as const;
export type AuthEmailKind = (typeof AUTH_EMAIL_KINDS)[number];
export type AuthLocale = 'ar' | 'en';

export const EMAIL_BRAND = {
  logo: 'https://raw.githubusercontent.com/gdgocdev-maker/gdg-main-platform-frontend/d2bf9bc57d98caa73356c7405eab1710de08da90/public/images/black-logo-with-colors.png',
  linkedin:
    'https://www.linkedin.com/company/google-developer-student-club-uj/',
  x: 'https://x.com/gdguoj?s=11',
};

type Message = {
  subject: string;
  preheader: string;
  label: string;
  headline: string;
  body: string[];
  cta: string;
  note: string[];
  fallback?: string;
  securityHeading?: string;
  privacy?: string;
  security: string;
  why: string;
};
const copy: Record<AuthLocale, Record<AuthEmailKind, Message>> = {
  en: {
    verification: {
      subject: 'Towards New Afaq',
      preheader:
        'Together, towards new horizons in learning and creating impact.',
      label: 'YOUR NEXT STEP',
      headline: 'Towards New Afaq',
      body: [
        'Welcome to a community that brings together learning, growth, and meaningful impact!✨',
        'Verify your email to take your next step with us',
      ],
      cta: 'Verify my email',
      note: [
        'This link expires in 1 hour. You can request a new one from the sign-in page',
      ],
      security:
        'You can ignore this email if you don’t have an account. Your email address won’t be verified unless you use this link',
      why: 'You received this email because this address was used to create or verify a GDG on Campus UJ account.',
      privacy: 'Never share your verification links or codes',
    },
    reset: {
      subject: 'Reset Your Password',
      preheader: 'A secure link to choose a new password.',
      label: 'ACCOUNT RECOVERY',
      headline: 'Reset your password',
      body: [
        'We received a request to reset the password linked to your account',
        'Click the button below to choose a new password and regain access to your account',
      ],
      cta: 'Reset my password',
      note: ['This link expires in 1 hour and can only be used once'],
      security:
        'Didn’t request a password reset? You can ignore this email, and your current password will remain unchanged',
      why: 'You received this email because a password reset was requested for your account.',
      privacy:
        'For your account’s security, never share your password reset links or verification codes with anyone',
    },
    welcome: {
      subject:
        'Welcome to Google Developer Groups on Campus | University of Jeddah',
      preheader:
        'Together, towards new horizons in learning and creating impact.',
      label: 'WELCOME TO THE COMMUNITY',
      headline:
        'Together, towards new horizons in learning and creating impact.',
      body: [
        'Your email has been successfully verified!✨',
        'We’re delighted by your interest in joining our community.',
        'You can now explore our events, discover learning and development opportunities, and share your ideas and skills as part of a journey where we create impact together.',
      ],
      cta: 'Explore the Community',
      note: [
        'This link does not expire.',
        'Please note that membership applications are reviewed separately. Verifying your email does not constitute final acceptance into the community.',
      ],
      security:
        'Don’t recognize this account? Contact our team for assistance, and never share your login credentials with anyone.',
      why: 'You received this welcome because your GDG on Campus UJ email address was verified.',
      fallback:
        'If the button doesn’t work, you can copy the link below and open it directly in your browser:',
    },
    'email-change': {
      subject: 'Confirm Your Email Change',
      preheader:
        'Confirm the request to change the email address on your account.',
      label: 'ACCOUNT UPDATE',
      headline: 'Confirm your email change',
      body: [
        'We received a request to change the email address on your account',
        'Confirm the request below to proceed with the change',
      ],
      cta: 'Confirm email change',
      note: [
        'This link expires in 1 hour. You can request a new one from the sign-in page',
      ],
      security:
        'You can ignore this email if you did not request the change. The new email will not be verified unless you use this link.',
      why: 'You received this email because an email address change was requested for your account.',
      privacy: 'Never share your verification links or codes',
    },
    'password-changed': {
      subject: 'Your password has been successfully changed',
      preheader: 'A security update for your account.',
      label: 'SECURITY NOTICE',
      headline: 'Your password has been successfully changed',
      body: [
        'Your account password has been reset successfully. You can now sign in using your new password',
      ],
      cta: 'Sign In',
      note: [
        'Your sign-in link does not expire and does not contain your password or account recovery code',
      ],
      security:
        'If you did not request a password reset, please change your password immediately from the sign-in page and contact our team for assistance.',
      why: 'You received this security notice because a password reset was completed for your account.',
      securityHeading: 'Didn’t Reset Your Password?',
      privacy:
        'Important: Never share verification links or account recovery codes with anyone.',
      fallback:
        'If the button doesn’t work, you can copy the link below and open it directly in your browser:',
    },
  },
  ar: {
    verification: {
      subject: 'نحو آفـاقٍ جديدة',
      preheader: 'معًا نحو آفاق جديدة للتعلّم وتمكين الأثر.',
      label: 'خطوتك القادمة',
      headline: 'نحو آفـاقٍ جديدة',
      body: [
        'أهلًا بك في مجموعة تجمع بين التعلّم، والتطوير، وتمكين الأثر!✨',
        'أكّد بريدك الإلكتروني لتبدأ خطوتك القادمة معنا',
      ],
      cta: 'تأكيد بريدي الإلكتروني',
      note: [
        'تنتهي صلاحية الرابط بعد ساعة، يمكنك طلب رابط جديد من صفحة تسجيل الدخول',
      ],
      security:
        'يمكنك تجاهل هذه الرسالة إذا لم يكن لديك حساب، لن يتم تأكيد بريدك ما لم تستخدم هذا الرابط',
      why: 'وصلتك هذه الرسالة لأن هذا البريد استُخدم لإنشاء حساب في منصة مجموعة مطوّري جوجل بجامعة جدة أو لتأكيده.',
      privacy: 'لا تشارك روابط التحقق أو رموزه مع أي شخص',
    },
    reset: {
      subject: 'استعادة كلمة المرور',
      preheader: 'رابط آمن لاختيار كلمة مرور جديدة لحسابك.',
      label: 'استعادة الحساب',
      headline: 'إعادة تعيين كلمة المرور',
      body: [
        'تلقّينا طلبًا لإعادة تعيين كلمة المرور المرتبطة بحسابك',
        'اضغط على الزر أدناه لاختيار كلمة مرور جديدة واستعادة الوصول إلى حسابك',
      ],
      cta: 'إعادة تعيين كلمة المرور',
      note: [
        'تنتهي صلاحية هذا الرابط خلال ساعة واحدة، ويمكن استخدامه لمرة واحدة فقط',
      ],
      security:
        'لم تطلب إعادة تعيين كلمة المرور؟ يمكنك تجاهل هذه الرسالة، وستبقى كلمة مرورك الحالية كما هي',
      why: 'وصلتك هذه الرسالة بسبب تقديم طلب لإعادة تعيين كلمة المرور المرتبطة بحسابك.',
      privacy:
        'حرصًا على أمان حسابك، لا تشارك روابط إعادة تعيين كلمة المرور أو رموز التحقق مع أي شخص',
      fallback: 'لا يعمل الزر؟ انسخ الرابط التالي والصقه في متصفحك:',
    },
    welcome: {
      subject: 'أهلًا بك في مجموعة مطوّري جوجل بجامعة جدة',
      preheader: 'معًا، نحو آفاق جديدة للتعلّم وتمكين الأثر.',
      label: 'أهلًا بك في مجتمعنا',
      headline: 'معًا، نحو آفـاقٍ جديدة للتعلّم، وتمكين الأثر',
      body: [
        'تم تأكيد بريدك الإلكتروني!✨',
        'يُسعدنا اهتمامك بالانضمام إلى مجموعتنا',
        'يمكنك الآن التعرّف على فعالياتنا، واستكشاف فرص التعلّم والتطوير، ومشاركة أفكارك ومهاراتك، لتكون جزءًا من رحلة نصنع فيها أثرًا معًا',
      ],
      cta: 'استكشاف المجموعة',
      note: [
        'رابط المجموعة مُتاح دون مدة صلاحية',
        'نودّ التنويه إلى أن طلبات العضوية تخضع للمراجعة بشكل مُستقل، ولا يُعد تأكيد البريد الإلكتروني قبولًا نهائيًا للعضوية.',
      ],
      security:
        'لا تعرف هذا الحساب؟ تواصل مع فريقنا للمساعدة، ولا تشارك بيانات الدخول مع أي شخص.',
      why: 'وصلتك رسالة الترحيب بعد تأكيد بريدك الإلكتروني في منصة مجموعة مطوّري جوجل بجامعة جدة.',
      fallback:
        'إذا لم يعمل الزر، يمكنك نسخ الرابط أدناه وفتحه مباشرةً في متصفحك:',
    },
    'email-change': {
      subject: 'تحديث الحساب - تغيير البريد الإلكتروني',
      preheader: 'أكّد طلب تغيير البريد الإلكتروني المرتبط بحسابك.',
      label: 'تحديث الحساب',
      headline: 'تأكيد تغيير البريد الإلكتروني',
      body: [
        'تلقّينا طلبًا بتغيير البريد الإلكتروني المرتبط بحسابك',
        'أكّد الطلب أدناه لمتابعة التغيير',
      ],
      cta: 'تأكيد تغيير البريد',
      note: [
        'تنتهي صلاحية الرابط بعد ساعة، يمكنك طلب رابط جديد من صفحة تسجيل الدخول',
      ],
      security:
        'يمكنك تجاهل هذه الرسالة إذا لم تطلب التغيير. لن يتم تأكيد البريد الجديد ما لم تستخدم الرابط.',
      why: 'وصلتك هذه الرسالة بسبب تقديم طلب لتغيير البريد الإلكتروني المرتبط بحسابك.',
      privacy: 'لا تشارك روابط التحقق أو رموزه مع أي شخص',
    },
    'password-changed': {
      subject: 'تم تغيير كلمة المرور بنجاح',
      preheader: 'إشعار أمان لحسابك. يُرجى مراجعته.',
      label: 'إشعار أمان',
      headline: 'تم تغيير كلمة المرور بنجاح',
      body: [
        'تمت إعادة تعيين كلمة مرور حسابك بنجاح، يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة',
      ],
      cta: 'تسجيل الدخول',
      note: [
        'رابط تسجيل الدخول لا تنتهي صلاحيته، ولا يتضمن كلمة مرورك أو رمز استعادة الحساب',
      ],
      security:
        'إذا لم تكن قد طلبت إعادة تعيين كلمة المرور، يُرجى تغييرها فورًا من صفحة تسجيل الدخول والتواصل مع فريقنا للحصول على المساعدة',
      why: 'وصلتك رسالة الأمان هذه بعد اكتمال إعادة تعيين كلمة مرور حسابك.',
      securityHeading: 'لم تقم بإعادة تعيين كلمة المرور؟',
      privacy: 'لا تشارك روابط التحقق أو رموزه مع أي شخص.',
      fallback:
        'إذا لم يعمل الزر، يمكنك نسخ الرابط أدناه وفتحه مباشرةً في متصفحك:',
    },
  },
};
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
const table = (content: string, attributes = '') =>
  `<table role="presentation" border="0" cellpadding="0" cellspacing="0" ${attributes}>${content}</table>`;
const paragraph = (text: string, secondary = false) =>
  `<p class="${secondary ? 'muted' : 'ink'}" style="margin:0 0 20px;font-size:${secondary ? 14 : 16}px;line-height:1.8;color:${secondary ? '#5f6368' : '#202124'}">${text}</p>`;

// A table-backed HTML button plus fixed-size VML for Windows Outlook.
function button(url: string, label: string, rtl: boolean) {
  return table(
    `<tr><td align="${rtl ? 'right' : 'left'}" style="padding:4px 0 24px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:280px" arcsize="18%" stroke="f" fillcolor="#1967d2"><w:anchorlock/><center dir="${rtl ? 'rtl' : 'ltr'}" style="color:#ffffff;font-family:${rtl ? 'Tahoma' : 'Arial'};font-size:16px;font-weight:bold">${label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="cta" href="${url}" style="display:inline-block;background:#1967d2;border:1px solid #1967d2;border-radius:10px;color:#ffffff;font-size:16px;font-weight:700;line-height:24px;text-align:center;text-decoration:none;padding:14px 24px;mso-hide:all">${label}</a><!--<![endif]-->
</td></tr>`,
    'width="100%"',
  );
}
function codeBlock(code: string, ar: boolean) {
  return table(
    `<tr><td class="callout" style="padding:20px;background:#f1f3f4;border:1px solid #dadce0;border-radius:12px">${paragraph(ar ? 'أو أدخل رمز التحقّق:' : 'Or enter your verification code:', true)}<p dir="ltr" class="ink" style="margin:0;text-align:center;font-family:Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:5px;color:#202124">${escapeHtml(code)}</p></td></tr>`,
    'width="100%" style="margin:0 0 24px"',
  );
}
export function renderAuthEmail(input: {
  kind: AuthEmailKind;
  locale: AuthLocale;
  url: string;
  frontendOrigin: string;
  code?: string;
}) {
  const url = new URL(input.url);
  const origin = new URL(input.frontendOrigin);
  if (
    ![url, origin].every((value) =>
      ['http:', 'https:'].includes(value.protocol),
    )
  )
    throw new Error('Invalid auth email URL');
  const ar = input.locale === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const align = ar ? 'right' : 'left';
  const font = "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif";
  const languages: AuthLocale[] = ar ? ['ar', 'en'] : ['en', 'ar'];
  const messages = languages.map((locale) => ({
    locale,
    rtl: locale === 'ar',
    message: copy[locale][input.kind],
  }));
  const subject = `${copy.ar[input.kind].subject} | ${copy.en[input.kind].subject}`;
  const safeUrl = escapeHtml(url.href);
  const support = {
    ar: 'هل تحتاج إلى مساعدة؟ تواصل معنا عبر LinkedIn',
    en: 'Need help? Contact us on LinkedIn.',
  };
  const fallback = {
    ar: 'انسخ هذا الرابط والصقه في متصفحك إذا لم يعمل الزر:',
    en: 'Button not working? Copy and paste this link into your browser:',
  };
  const privacy = {
    ar: 'لا تشارك روابط التحقّق أو رموزه مع أي شخص.',
    en: 'Never share verification links or codes with anyone.',
  };
  const address = {
    ar: 'جامعة جدة · جدة، المملكة العربية السعودية',
    en: 'University of Jeddah · Jeddah, Saudi Arabia',
  };
  const strip = table(
    `<tr>${['#4285f4', '#34a853', '#f9ab00', '#ea4335'].map((color) => `<td width="25%" bgcolor="${color}" style="height:4px;font-size:0;line-height:4px">&nbsp;</td>`).join('')}</tr>`,
    'width="100%" dir="ltr" aria-hidden="true"',
  );
  const header = `<tr><td bgcolor="#ffffff" style="padding:28px 32px;border-bottom:1px solid #dadce0;background:#ffffff;color:#202124"><img src="${EMAIL_BRAND.logo}" width="280" height="45" alt="GDG on Campus UJ" style="display:block;width:280px;max-width:100%;height:auto;border:0"></td></tr>`;
  const sections = messages
    .map(({ locale, rtl, message }) => {
      const sectionDir = rtl ? 'rtl' : 'ltr';
      const sectionAlign = rtl ? 'right' : 'left';
      const sectionCallout = table(
        `<tr><td class="callout" style="background:#f1f3f4;padding:20px;border-radius:12px;border-${rtl ? 'right' : 'left'}:3px solid ${input.kind === 'password-changed' ? '#ea4335' : '#4285f4'}">${message.securityHeading ? paragraph(escapeHtml(message.securityHeading), true) : ''}${paragraph(escapeHtml(message.security), true)}<p class="muted" style="margin:0;color:#5f6368;font-size:14px;line-height:1.8">${message.privacy ?? privacy[locale]}</p></td></tr>`,
        'width="100%"',
      );
      return `<tr><td class="content" align="${sectionAlign}" dir="${sectionDir}" style="padding:32px;border-bottom:1px solid #dadce0">
<p class="link" style="margin:0 0 12px;color:#1967d2;font-size:14px;font-weight:700;line-height:1.6">${message.label}</p>
<h1 class="ink" style="margin:0 0 20px;font-size:28px;line-height:1.4;font-weight:700;letter-spacing:${rtl ? '0' : '-0.6px'};color:#202124">${message.headline}</h1>
${message.body.map((line) => paragraph(escapeHtml(line))).join('')}${input.code ? codeBlock(input.code, rtl) : ''}${button(safeUrl, message.cta, rtl)}${message.note.map((line) => paragraph(escapeHtml(line), true)).join('')}
${table(`<tr><td style="padding:0 0 24px">${paragraph(message.fallback ?? fallback[locale], true)}<a class="link" dir="ltr" href="${safeUrl}" style="display:block;color:#1967d2;font-size:14px;line-height:1.7;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;text-align:${sectionAlign}">${safeUrl}</a></td></tr>`, 'width="100%" style="table-layout:fixed"')}
${sectionCallout}<p class="muted" style="margin:24px 0 0;font-size:14px;line-height:1.8;color:#5f6368"><a class="link" href="${EMAIL_BRAND.linkedin}" style="color:#1967d2;text-decoration:underline">${support[locale]}</a></p></td></tr>`;
    })
    .join('');
  const footer = `<tr><td class="footer" style="padding:24px 32px;background:#f8f9fa;border-top:1px solid #dadce0;color:#5f6368;font-size:14px;line-height:1.8">
<p class="ink" dir="ltr" style="margin:0 0 4px;color:#202124;font-weight:700">GDG on Campus</p><p dir="rtl" style="margin:0 0 4px">${address.ar}</p><p dir="ltr" style="margin:0 0 16px">${address.en}</p>
<p style="margin:0 0 16px"><a class="link" href="${EMAIL_BRAND.linkedin}" style="color:#1967d2">LinkedIn</a> &nbsp;·&nbsp; <a class="link" href="${EMAIL_BRAND.x}" style="color:#1967d2">X</a></p>
<p dir="rtl" style="margin:0 0 12px">${copy.ar[input.kind].why}</p><p dir="ltr" style="margin:0 0 12px">${copy.en[input.kind].why}</p><p dir="rtl" style="margin:0 0 4px">هذه رسالة آلية من <span dir="ltr" style="display:inline-block">noreply@gdguj.org</span>. للمساعدة، يمكنك التواصل معنا عبر الرابط أعلاه.</p><p dir="ltr" style="margin:0">This is an automated message from <span dir="ltr" style="display:inline-block">noreply@gdguj.org</span>. For help, use the contact link above.</p></td></tr>`;
  const html = `<!doctype html><html lang="${input.locale}" dir="${dir}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(subject)}</title><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--><style>:root{color-scheme:light dark;supported-color-schemes:light dark}body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}a:focus-visible{outline:3px solid #4285f4;outline-offset:3px}@media(max-width:620px){.outer{padding:16px 12px!important}.content{padding:28px 24px!important}.footer{padding:24px!important}h1{font-size:28px!important}.cta{display:block!important}}@media(prefers-color-scheme:dark){body,.canvas{background:#171717!important}.card{background:#202124!important}.ink{color:#f1f3f4!important}.muted,.footer{color:#c4c7c5!important}.footer,.callout{background:#292a2d!important;border-color:#5f6368!important}.link{color:#a8c7fa!important}.cta{background:#1967d2!important;color:#ffffff!important}}</style></head><body style="margin:0;padding:0;background:#f1f3f4;color:#202124;font-family:${font}"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${copy.ar[input.kind].preheader} · ${copy.en[input.kind].preheader}${'&#847; &zwnj; &nbsp;'.repeat(40)}</div>
${table(`<tr><td class="outer" align="center" style="padding:32px 16px"><!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->${table(`<tr><td>${strip}</td></tr>${header}${sections}${footer}`, `class="card" width="100%" dir="${dir}" style="max-width:600px;border-collapse:separate;border-spacing:0;overflow:hidden;background:#ffffff;border:1px solid #dadce0;border-radius:16px;font-family:${font}"`)}<!--[if mso]></td></tr></table><![endif]--></td></tr>`, 'class="canvas" width="100%" style="background:#f1f3f4"')}</body></html>`;
  return {
    subject,
    html,
    text:
      messages
        .map(
          ({ locale, message }) =>
            `${message.subject}\n\n${message.headline}\n\n${message.body.join('\n\n')}\n\n${input.code ? `${locale === 'ar' ? 'رمز التحقّق' : 'Verification code'}: ${input.code}\n\n` : ''}${message.cta}: ${url.href}\n\n${message.note.join('\n\n')}\n\n${message.fallback ?? fallback[locale]}\n${url.href}\n\n${message.securityHeading ? `${message.securityHeading}\n\n` : ''}${message.security}\n${message.privacy ?? privacy[locale]}\n\n${support[locale]}: ${EMAIL_BRAND.linkedin}`,
        )
        .join('\n\n---\n\n') +
      `\n\nGDG on Campus\n${address.ar}\n${address.en}\nLinkedIn: ${EMAIL_BRAND.linkedin}\nX: ${EMAIL_BRAND.x}\n\n${copy.ar[input.kind].why}\n${copy.en[input.kind].why}\nهذه رسالة آلية من noreply@gdguj.org. للمساعدة، يمكنك التواصل معنا عبر الرابط أعلاه.\nThis is an automated message from noreply@gdguj.org. For help, use the contact link above.`,
  };
}
