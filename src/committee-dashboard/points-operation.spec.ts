import { ConflictException } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import { CommitteeDashboardService } from './committee-dashboard.service.js';

it('replays the original global award after a lost response and rejects changed input', async () => {
  const createdAt = new Date();
  const dto = { operationId: '60068d3b-f8de-43fc-a96b-57d47ff3ff19', pointsDelta: 5, reason: 'Event work' };
  const prior = { ...dto, createdAt, pointEntryId: 3, memberId: 4, awardedByMemberId: 2, recipientName: 'Original name' };
  const tx = {
    $queryRaw: vi.fn(), committeePointEntry: { findUnique: vi.fn().mockResolvedValue(null) },
    globalPointEntry: { findUnique: vi.fn().mockResolvedValue(prior), create: vi.fn() },
  };
  const prisma = {
    memberRole: { findFirst: vi.fn().mockResolvedValue({ member: { person: { fullName: 'Current name' } } }) },
    $transaction: (work: (value: typeof tx) => unknown) => work(tx),
  };
  const service = new CommitteeDashboardService(prisma as never, { hasGlobalPermission: async () => true } as never);
  const actor = { memberId: 2 } as never;
  await expect(service.updateDeveloperLeaderPoints(actor, 4, dto)).resolves.toEqual({
    id: '3', memberId: '4', memberName: 'Original name', pointsDelta: 5, reason: 'Event work', createdAt: createdAt.toISOString(),
  });
  await expect(service.updateDeveloperLeaderPoints(actor, 4, { ...dto, pointsDelta: 6 })).rejects.toBeInstanceOf(ConflictException);
  expect(tx.globalPointEntry.create).not.toHaveBeenCalled();
});

it('appends a committee award once and replays the stored result', async () => {
  const dto = { operationId: '73725bba-cf21-42c5-8528-e836947792ca', pointsDelta: 3, reason: 'Support' };
  const entry = { ...dto, createdAt: new Date(), pointEntryId: 7, memberId: 4, awardedByMemberId: 2, committeeId: 8, recipientName: 'Sam' };
  const ledger = {
    findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(entry),
    aggregate: vi.fn().mockResolvedValue({ _sum: { pointsDelta: 0 } }),
    create: vi.fn().mockResolvedValue(entry),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ role: 'Member' }]), committeePointEntry: ledger,
    globalPointEntry: { findUnique: vi.fn().mockResolvedValue(null) },
    member: { findUniqueOrThrow: vi.fn().mockResolvedValue({ person: { fullName: 'Sam' } }) },
  };
  const prisma = {
    committee: { findUnique: async () => ({ committeeId: 8 }) },
    memberCommittee: { findUnique: async () => ({ role: 'Leader', member: { isActive: true, person: { isActive: true } } }) },
    $transaction: (work: (value: typeof tx) => unknown) => work(tx),
  };
  const access = { hasCommitteePermission: async () => true, hasGlobalPermission: async () => false };
  const service = new CommitteeDashboardService(prisma as never, access as never);
  const award = () => service.updatePoints({ memberId: 2 } as never, 'DATA', 4, dto);
  const initial = await award();
  await expect(award()).resolves.toEqual(initial);
  expect(ledger.create).toHaveBeenCalledTimes(1);
});
