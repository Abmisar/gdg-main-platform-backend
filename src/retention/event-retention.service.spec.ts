import { describe, expect, it, vi } from 'vitest';
import { EventRetentionService } from './event-retention.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('event retention', () => {
  it('aggregates each deleted batch before removing linked blacklist records and registrations', async () => {
    const order: string[] = [];
    const tx = {
      $queryRaw: vi.fn(),
      eventRegistration: { findMany: vi.fn().mockResolvedValue([{ registrationId: 1, eventId: 9, checkedInAt: new Date() }, { registrationId: 2, eventId: 9, checkedInAt: null }]), deleteMany: vi.fn(async () => { order.push('delete'); return { count: 2 }; }) },
      eventRetentionAggregate: { upsert: vi.fn(async () => { order.push('aggregate'); }) },
      registrationBlacklistEntry: { deleteMany: vi.fn(async () => { order.push('blacklist'); }) },
    };
    const db = { eventRegistration: { findMany: vi.fn().mockResolvedValue([{ registrationId: 1 }, { registrationId: 2 }]) }, $transaction: vi.fn(async (fn) => fn(tx)) };
    const service = new EventRetentionService(db as unknown as PrismaService);
    expect(await service.run(new Date(), false)).toBe(2);
    expect(order).toEqual(['aggregate', 'blacklist', 'delete']);
    expect(tx.eventRetentionAggregate.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ eventId: 9, registeredCount: 2, attendedCount: 1 }) }));
  });
  it('does not mutate in dry run', async () => {
    const db = { eventRegistration: { findMany: vi.fn().mockResolvedValue([{ registrationId: 1 }]) }, $transaction: vi.fn() };
    expect(await new EventRetentionService(db as unknown as PrismaService).run(new Date(), true)).toBe(1);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
