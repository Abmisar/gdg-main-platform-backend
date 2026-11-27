import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CommitteeAccessService } from '../registrations/committee-access.service.js';
import type { MembershipRequestEmailService } from '../membership-requests/membership-request-email.service.js';
import { CommitteeDashboardService } from './committee-dashboard.service.js';

const actor = { personId: 10, memberId: 20 };
const person = {
  personId: 50,
  fullName: 'Existing Account',
  emailPersonal: 'existing@example.test',
  emailUniversity: null,
  authUserId: 'auth-user-50',
  isActive: true,
};

function setup() {
  const emailService = { sendDecisionEmail: vi.fn().mockResolvedValue(undefined) };
  const tx = {
    authUser: { delete: vi.fn(), deleteMany: vi.fn() },
    person: {
      findFirst: vi.fn().mockResolvedValue({ ...person, member: { memberId: 70, isActive: true, roleAssignments: [] } }),
      findMany: vi.fn().mockResolvedValue([{ ...person, member: { memberId: 70, isActive: true, roleAssignments: [] } }]),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    member: { delete: vi.fn().mockResolvedValue({ memberId: 70 }) },
    memberRole: {
      findFirst: vi.fn().mockResolvedValue({ id: 5 }),
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    memberCommittee: {
      findUnique: vi.fn<(args: { where: { memberId_committeeId: { memberId: number; committeeId: number } }; select: { id: boolean; role: boolean } }) => Promise<{ id: number; role: string } | null>>().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ role: 'Member' }),
      delete: vi.fn().mockResolvedValue({ id: 123 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    event: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    eventRegistration: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    registrationBlacklistEntry: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    membershipRequestCommittee: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    membershipRequestGlobalRole: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    committeePointEntry: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    globalPointEntry: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    announcement: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    committeeTask: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    walletBarcodeAlias: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    walletMembershipLink: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    memberSkill: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    committee: { findFirst: vi.fn().mockResolvedValue({ committeeId: 3, committeeCode: 'PR', committeeName: 'Public Relations' }) },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    committee: {
      findUnique: vi.fn().mockResolvedValue({ committeeId: 3, committeeCode: 'PR', committeeName: 'Public Relations' }),
    },
    memberCommittee: { findUnique: vi.fn().mockResolvedValue({ memberId: actor.memberId, role: 'Co-Leader', member: { isActive: true, person: { isActive: true } } }) },
  };
  const access = {
    hasGlobalPermission: vi.fn().mockResolvedValue(true),
    hasCommitteePermission: vi.fn().mockResolvedValue(true),
  };
  const service = new CommitteeDashboardService(
    prisma as unknown as PrismaService,
    access as unknown as CommitteeAccessService,
    undefined,
    emailService as unknown as MembershipRequestEmailService,
  );
  return { service, tx, prisma, access, emailService };
}

describe('direct member assignment notifications', () => {
  it('sends the existing approval email after a committee leader adds an account', async () => {
    const { service, emailService } = setup();
    await service.addMember(actor, 'PR', { email: person.emailPersonal! });
    await vi.waitFor(() => expect(emailService.sendDecisionEmail).toHaveBeenCalledWith({
      to: person.emailPersonal,
      recipientName: person.fullName,
      decision: 'APPROVED',
      committeeName: 'Public Relations',
      roleName: 'Member',
    }));
  });

  it('sends the approval email when group leadership directly assigns a committee role', async () => {
    const { service, tx, emailService } = setup();
    tx.committee.findFirst.mockResolvedValue({ committeeId: 3, committeeCode: 'PR', committeeName: 'Public Relations' });
    tx.memberCommittee.create.mockResolvedValue({ role: 'Co-Leader' });
    await service.assignClubPerson(actor, {
      email: person.emailPersonal!,
      committeeCode: 'PR',
      role: 'Co-Leader',
    });
    await vi.waitFor(() => expect(emailService.sendDecisionEmail).toHaveBeenCalledWith({
      to: person.emailPersonal,
      recipientName: person.fullName,
      decision: 'APPROVED',
      committeeName: 'Public Relations',
      roleName: 'Co-Leader',
    }));
  });

  it('sends the approval email when the overall Developer Committees Leader assigns a role', async () => {
    const { service, prisma, tx, emailService } = setup();
    vi.mocked(prisma.committee.findUnique).mockResolvedValue({
      committeeId: 6,
      committeeCode: 'DATA',
      committeeName: 'Data Analysis',
      parent: { committeeCode: 'DEV' },
    } as any);
    tx.memberCommittee.create.mockResolvedValue({ role: 'Leader' });
    await service.assignDeveloperCommitteeMember(actor, {
      email: person.emailPersonal!,
      committeeCode: 'DATA',
      role: 'Leader',
    });
    await vi.waitFor(() => expect(emailService.sendDecisionEmail).toHaveBeenCalledWith({
      to: person.emailPersonal,
      recipientName: person.fullName,
      decision: 'APPROVED',
      committeeName: 'Data Analysis',
      roleName: 'Leader',
    }));
  });
});

describe('club member removal', () => {
  it('requires the group member-management permission', async () => {
    const { service, access, prisma } = setup();
    vi.mocked(access.hasGlobalPermission).mockResolvedValue(false);
    await expect(service.removeClubPerson(actor, { email: person.emailPersonal! })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes the member and clears shared attribution while retaining the person account', async () => {
    const { service, tx } = setup();
    const result = await service.removeClubPerson(actor, { email: person.emailPersonal! });
    expect(tx.member.delete).toHaveBeenCalledExactlyOnceWith({ where: { memberId: 70 } });
    for (const delegate of [tx.committeePointEntry, tx.globalPointEntry, tx.memberSkill, tx.memberCommittee, tx.memberRole]) {
      expect(delegate.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { memberId: 70 } });
    }
    expect(tx.announcement.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { publishedByMemberId: 70 } });
    expect(tx.committeeTask.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { OR: [{ assignedMemberId: 70 }, { createdByMemberId: 70 }] },
    });
    expect(tx.walletBarcodeAlias.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { link: { memberId: 70 } } });
    expect(tx.walletMembershipLink.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { memberId: 70 } });
    for (const [delegate, field] of [
      [tx.registrationBlacklistEntry, 'resolvedByMemberId'],
      [tx.membershipRequestCommittee, 'decidedByMemberId'],
      [tx.membershipRequestGlobalRole, 'decidedByMemberId'],
      [tx.memberRole, 'assignedBy'],
    ] as const) {
      expect(delegate.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { [field]: 70 }, data: { [field]: null } });
    }
    expect(tx.event.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { createdByMemberId: 70 }, data: { createdByMemberId: null },
    });
    expect(tx.eventRegistration.updateMany).toHaveBeenCalledTimes(3);
    for (const field of ['reviewedByMemberId', 'checkedInByMemberId', 'excusedByMemberId']) {
      expect(tx.eventRegistration.updateMany).toHaveBeenCalledWith({ where: { [field]: 70 }, data: { [field]: null } });
    }
    for (const points of [tx.committeePointEntry, tx.globalPointEntry]) {
      expect(points.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { awardedByMemberId: 70 }, data: { awardedByMemberId: null },
      });
    }
    const [memberDeletion] = tx.member.delete.mock.invocationCallOrder;
    for (const clear of [tx.event.updateMany, tx.eventRegistration.updateMany, tx.committeePointEntry.updateMany, tx.globalPointEntry.updateMany]) {
      expect(Math.max(...clear.mock.invocationCallOrder)).toBeLessThan(memberDeletion);
    }
    expect(tx.person.delete).not.toHaveBeenCalled();
    expect(tx.person.deleteMany).not.toHaveBeenCalled();
    expect(tx.authUser.delete).not.toHaveBeenCalled();
    expect(tx.authUser.deleteMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ memberId: '70', membershipRemoved: true });
  });

  it('removes only the selected committee membership without deactivating the group account', async () => {
    const { service, tx } = setup();
    tx.committee.findFirst.mockResolvedValue({ committeeId: 3, committeeCode: 'PR', committeeName: 'Public Relations' });
    tx.memberCommittee.findUnique.mockImplementation(async ({ where }) =>
      where.memberId_committeeId?.memberId === 70 && where.memberId_committeeId?.committeeId === 3
        ? { id: 123, role: 'Co-Leader' } : null,
    );
    const result = await service.removeClubPerson(actor, { email: person.emailPersonal!, committeeCode: 'PR' });
    expect(tx.memberCommittee.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { memberId_committeeId: { memberId: 70, committeeId: 3 } },
      select: { id: true, role: true },
    });
    expect(tx.memberCommittee.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: 123 } });
    expect(tx.committeePointEntry.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { memberId: 70, committeeId: 3 } });
    expect(tx.committeePointEntry.deleteMany).toHaveBeenCalledBefore(tx.memberCommittee.delete);
    expect(tx.globalPointEntry.deleteMany).not.toHaveBeenCalled();
    expect(tx.memberCommittee.deleteMany).not.toHaveBeenCalled();
    expect(tx.member.delete).not.toHaveBeenCalled();
    expect(tx.person.delete).not.toHaveBeenCalled();
    expect(tx.person.deleteMany).not.toHaveBeenCalled();
    expect(tx.authUser.delete).not.toHaveBeenCalled();
    expect(tx.authUser.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(result).toMatchObject({ committee: { code: 'PR', role: 'Co-Leader' }, committeeMembershipRemoved: true, membershipRemoved: false });
  });

  it('revokes only the selected advisor role and keeps the account active', async () => {
    const { service, tx } = setup();
    const result = await service.removeClubPerson(actor, { email: person.emailPersonal!, committeeCode: 'ADVISOR' });
    expect(tx.memberRole.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ memberId: 70, roleCode: 'ADVISOR', AND: expect.any(Array) }),
    }));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.memberCommittee.delete).not.toHaveBeenCalled();
    expect(tx.member.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ globalRole: 'ADVISOR', globalRoleRemoved: true, membershipRemoved: false });
  });

  it('does not remove the last active group leader', async () => {
    const { service, tx } = setup();
    tx.person.findMany.mockResolvedValue([{
      ...person,
      member: { memberId: 70, isActive: true, roleAssignments: [{ roleCode: 'GROUP_LEADER' }] },
    }]);
    await expect(service.removeClubPerson(actor, { email: person.emailPersonal! })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.member.delete).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
