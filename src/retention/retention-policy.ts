export const RETENTION_POLICY = Object.freeze({
  applicationMonths: 12,
  inactiveAccountMonths: 36,
  inactiveAccountWarningDays: 30,
  authLogMonths: 12,
  eventRegistrationMonths: 24,
  emailDeliveryDays: 90,
});

export type RetentionPolicy = { [K in keyof typeof RETENTION_POLICY]: number };

export function retentionPolicy(env: NodeJS.ProcessEnv = process.env): RetentionPolicy {
  const value = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
      throw new Error(`Invalid retention setting: ${name}`);
    }
    return Number(raw);
  };
  return {
    applicationMonths: value('RETENTION_APPLICATION_MONTHS', RETENTION_POLICY.applicationMonths),
    inactiveAccountMonths: value('RETENTION_INACTIVE_ACCOUNT_MONTHS', RETENTION_POLICY.inactiveAccountMonths),
    inactiveAccountWarningDays: value('RETENTION_WARNING_DAYS', RETENTION_POLICY.inactiveAccountWarningDays),
    authLogMonths: value('RETENTION_AUTH_LOG_MONTHS', RETENTION_POLICY.authLogMonths),
    eventRegistrationMonths: value('RETENTION_EVENT_MONTHS', RETENTION_POLICY.eventRegistrationMonths),
    emailDeliveryDays: value('RETENTION_EMAIL_DELIVERY_DAYS', RETENTION_POLICY.emailDeliveryDays),
  };
}

export function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

export function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
