import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

export async function removeMember(
  transaction: Prisma.TransactionClient,
  member: { memberId: number },
) {
  const leaders = await transaction.$queryRaw<{ member_id: number }[]>`
    SELECT r.member_id FROM member_role r
    JOIN member m ON m.member_id = r.member_id
    JOIN person p ON p.person_id = m.person_id
    WHERE r.role_code IN ('GROUP_LEADER', 'GROUP_CO_LEADER')
      AND m.is_active AND p.is_active
      AND (r.starts_on IS NULL OR r.starts_on <= (now() AT TIME ZONE 'Asia/Riyadh')::date)
      AND (r.ends_on IS NULL OR r.ends_on >= (now() AT TIME ZONE 'Asia/Riyadh')::date)
    ORDER BY r.id FOR UPDATE OF r`;
  if (leaders.length && leaders.every(row => row.member_id === member.memberId)) {
    throw new ConflictException('The last active group leader cannot be removed.');
  }

  await transaction.event.updateMany({
    where: { createdByMemberId: member.memberId },
    data: { createdByMemberId: null },
  });
  await transaction.eventRegistration.updateMany({
    where: { reviewedByMemberId: member.memberId },
    data: { reviewedByMemberId: null },
  });
  await transaction.eventRegistration.updateMany({
    where: { checkedInByMemberId: member.memberId },
    data: { checkedInByMemberId: null },
  });
  await transaction.eventRegistration.updateMany({
    where: { excusedByMemberId: member.memberId },
    data: { excusedByMemberId: null },
  });
  await transaction.registrationBlacklistEntry.updateMany({
    where: { resolvedByMemberId: member.memberId },
    data: { resolvedByMemberId: null },
  });
  await transaction.membershipRequestCommittee.updateMany({
    where: { decidedByMemberId: member.memberId },
    data: { decidedByMemberId: null },
  });
  await transaction.membershipRequestGlobalRole.updateMany({
    where: { decidedByMemberId: member.memberId },
    data: { decidedByMemberId: null },
  });
  await transaction.memberRole.updateMany({
    where: { assignedBy: member.memberId },
    data: { assignedBy: null },
  });
  await transaction.committeePointEntry.updateMany({
    where: { awardedByMemberId: member.memberId },
    data: { awardedByMemberId: null },
  });
  await transaction.globalPointEntry.updateMany({
    where: { awardedByMemberId: member.memberId },
    data: { awardedByMemberId: null },
  });

  await transaction.announcement.updateMany({
    where: { publishedByMemberId: member.memberId }, data: { publishedByMemberId: null },
  });
  await transaction.committeeTask.updateMany({
    where: { createdByMemberId: member.memberId }, data: { createdByMemberId: null },
  });
  await transaction.committeeTask.deleteMany({ where: { assignedMemberId: member.memberId } });
  await transaction.committeePointEntry.deleteMany({
    where: { memberId: member.memberId },
  });
  await transaction.globalPointEntry.deleteMany({
    where: { memberId: member.memberId },
  });
  await transaction.walletBarcodeAlias.deleteMany({
    where: { link: { memberId: member.memberId } },
  });
  await transaction.walletMembershipLink.deleteMany({
    where: { memberId: member.memberId },
  });
  await transaction.memberSkill.deleteMany({
    where: { memberId: member.memberId },
  });
  await transaction.memberCommittee.deleteMany({
    where: { memberId: member.memberId },
  });
  await transaction.memberRole.deleteMany({
    where: { memberId: member.memberId },
  });
  await transaction.member.delete({ where: { memberId: member.memberId } });
}
