import { Logger } from '@nestjs/common';

const thresholds = { failedLogin: 20, reportRead: 5, staffRead: 60 };
type Signal = keyof typeof thresholds;
const windowMs = 5 * 60_000;
const cooldownMs = 30 * 60_000;
const staffCollections = new Set([
  '/events/:eventId/registrations',
  '/registrations/blacklist',
  '/membership-requests',
  '/membership-requests/leadership',
  '/my/committees/:committeeCode/members',
]);

function classify(method: string, path: string, status: number): Signal | undefined {
  if (method === 'POST' && /^\/api\/auth\/sign-in\/email\/?$/i.test(path) && [401, 429].includes(status)) return 'failedLogin';
  if (method !== 'GET' || status < 200 || status >= 300) return;
  if (path === '/data/event-reports/events/:eventId') return 'reportRead';
  if (staffCollections.has(path)) return 'staffRead';
}

export class IncidentAlerts {
  private readonly logger = new Logger(IncidentAlerts.name);
  private readonly recent = new Map<Signal, number[]>();
  private readonly suppressedUntil = new Map<Signal, number>();

  constructor(private readonly notify: (signal: Signal, count: number) => Promise<void>) {}

  observe(method: string, path: string, status: number, now = Date.now()) {
    const signal = classify(method, path, status);
    if (!signal || now < (this.suppressedUntil.get(signal) ?? 0)) return;
    const timestamps = (this.recent.get(signal) ?? []).filter(time => now - time < windowMs);
    timestamps.push(now);
    this.recent.set(signal, timestamps);
    if (timestamps.length < thresholds[signal]) return;
    this.recent.delete(signal);
    this.suppressedUntil.set(signal, now + cooldownMs);
    this.logger.warn({ event: 'incident_threshold_reached', signal });
    void this.notify(signal, timestamps.length).catch(() => {
      this.logger.error({ event: 'incident_alert_delivery_failed', signal });
    });
  }
}
