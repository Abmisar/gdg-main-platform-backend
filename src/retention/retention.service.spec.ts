import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetentionService } from './retention.service.js';
import type { EventRetentionService } from './event-retention.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const rows = () => ({ findMany: vi.fn().mockResolvedValue([]) });
const setup = () => {
  const db = { authUser: rows(), $queryRaw: vi.fn().mockResolvedValue([{ staffLogs: 0, rightsLogs: 0 }]), membershipRequest: rows(), authSession: rows(), authRateLimitBucket: rows(), betterAuthRateLimit: rows(), registrationEmailDelivery: rows(), $transaction: vi.fn() };
  return { db, service: new RetentionService(db as unknown as PrismaService, { run: vi.fn().mockResolvedValue(0) } as unknown as EventRetentionService) };
};
afterEach(() => { delete process.env.RETENTION_ENABLED; delete process.env.RETENTION_DRY_RUN; });
describe('retention scheduler', () => {
  it('is disabled by default', async () => {
    const { db, service } = setup();
    await service.runScheduled();
    expect(db.membershipRequest.findMany).not.toHaveBeenCalled();
  });
  it('uses dry run by default and bounds every query', async () => {
    const { db, service } = setup();
    process.env.RETENTION_ENABLED = 'true';
    await service.runScheduled();
    expect(db.$transaction).not.toHaveBeenCalled();
    for (const model of [db.authUser, db.membershipRequest, db.authSession, db.authRateLimitBucket, db.betterAuthRateLimit, db.registrationEmailDelivery]) expect(model.findMany.mock.calls[0][0].take).toBe(100);
  });
});
