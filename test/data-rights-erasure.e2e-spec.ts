import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RightsService } from '../src/data-rights/rights.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { schemaTestTarget } from './schema-test-target.js';

it('erases staff attribution while retaining completed decisions and a deliverable guest withdrawal', async () => {
  const db = new PrismaService(
    new ConfigService({
      DATABASE_URL: schemaTestTarget(
        process.env.TEST_DATABASE_URL,
        process.env.DATABASE_URL,
      ),
    }),
  );
  const rollback = new Error('discard synthetic fixtures');
  try {
    await expect(
      db.$transaction(
        async (tx) => {
          const rights = new RightsService({
            memberRole: tx.memberRole,
            $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
          } as unknown as PrismaService);
          const universityEmail = randomUUID() + '_%tag@university.example.test';
          const staff = await tx.person.create({
            data: {
              fullName: 'Synthetic staff',
              emailUniversity: universityEmail,
              emailUniversityVerifiedAt: new Date(),
              member: { create: {} },
            },
            include: { member: true },
          });
          const memberId = staff.member!.memberId;
          const guest = await tx.person.create({
            data: { fullName: 'Synthetic applicant' },
          });
          const other = await tx.person.create({
            data: { fullName: 'Synthetic attendee' },
          });
          const code =
            'T' + randomUUID().replaceAll('-', '').slice(0, 15).toUpperCase();
          const committee = await tx.committee.create({
            data: { committeeCode: code, committeeName: code },
          });
          const at = new Date();
          const later = new Date(at.getTime() + 86400000);
          const event = await tx.event.create({
            data: {
              name: 'Synthetic event',
              capacity: 10,
              registrationDeadline: at,
              startsAt: later,
              endsAt: new Date(later.getTime() + 60000),
              committeeId: committee.committeeId,
              createdByMemberId: memberId,
            },
          });
          const checked = await tx.eventRegistration.create({
            data: {
              eventId: event.eventId,
              personId: guest.personId,
              status: 'CONFIRMED',
              approvedAt: at,
              confirmedAt: at,
              confirmationDeadline: later,
              attendanceMethod: 'MEMBER_CARD',
              checkedInAt: at,
              checkedInByMemberId: memberId,
            },
          });
          const excused = await tx.eventRegistration.create({
            data: {
              eventId: event.eventId,
              personId: other.personId,
              status: 'EXCUSED',
              excusedAt: at,
              excusedByMemberId: memberId,
              excuseReason: 'Synthetic excuse',
            },
          });
          const blacklist = await tx.registrationBlacklistEntry.create({
            data: {
              registrationId: excused.registrationId,
              reason: 'NO_CHECK_IN',
              createdAt: at,
              resolvedAt: at,
              resolvedByMemberId: memberId,
              resolutionReason: 'Synthetic resolution',
            },
          });
          const application = await tx.membershipRequest.create({
            data: {
              personId: guest.personId,
              applicationData: {},
              committees: {
                create: {
                  committeeId: committee.committeeId,
                  requestedRole: 'Member',
                  status: 'APPROVED',
                  decidedAt: at,
                  decidedByMemberId: memberId,
                },
              },
              globalRoles: {
                create: {
                  roleCode: 'ADVISOR',
                  status: 'REJECTED',
                  decidedAt: at,
                  decidedByMemberId: memberId,
                },
              },
            },
          });
          const own = await tx.eventRegistration.create({
            data: {
              personId: staff.personId,
              eventId: event.eventId,
              walletProjection: {
                create: {
                  revision: 7,
                  active: true,
                  pending: false,
                  fingerprint: 'a'.repeat(64),
                },
              },
            },
          });
          const orphan = await tx.manualRightsRequest.create({
            data: {
              kind: 'complaint',
              contactEmail: universityEmail.toUpperCase(),
              receivedAt: at,
              dueAt: later,
            },
          });
          const unrelated = await tx.manualRightsRequest.create({
            data: {
              personId: other.personId,
              kind: 'complaint',
              contactEmail: universityEmail,
              receivedAt: at,
              dueAt: later,
            },
          });
          const lookalike = universityEmail.replace('_%', 'xextra');
          const decoy = await tx.manualRightsRequest.create({ data: {
            kind: 'complaint', contactEmail: lookalike, receivedAt: at, dueAt: later,
          } });
          const leader = await tx.memberRole.create({ data: { memberId, roleCode: 'GROUP_LEADER' } });
          const actor = { personId: staff.personId, memberId };
          await tx.person.update({ where: { personId: other.personId }, data: { emailUniversity: lookalike, emailUniversityVerifiedAt: at } });
          const literal = await rights.logManual(actor, { kind: 'complaint', contactEmail: universityEmail.toUpperCase() });
          expect(literal.personId).toBe(staff.personId);
          const shared = randomUUID() + '@university.example.test';
          const owners = await Promise.all(Array.from({ length: 3 }, () => tx.person.create({ data: {
            fullName: 'Synthetic verified owner', emailUniversity: shared, emailUniversityVerifiedAt: at,
          } })));
          await expect(rights.logManual(actor, { kind: 'complaint', contactEmail: shared })).rejects.toMatchObject({ status: 409 });
          expect(await tx.manualRightsRequest.count({ where: { contactEmail: shared } })).toBe(0);
          for (const owner of owners) {
            expect((await rights.logManual(actor, { kind: 'complaint', contactEmail: shared, personId: owner.personId })).personId).toBe(owner.personId);
          }
          await expect(rights.logManual(actor, { kind: 'complaint', contactEmail: shared, personId: staff.personId })).rejects.toMatchObject({ status: 400 });
          await tx.memberRole.delete({ where: { id: leader.id } });
          await tx.walletMembershipLink.create({
            data: {
              walletPublicId: randomUUID(),
              memberId,
              barcodeAliases: {
                create: { barcodeHash: 'b'.repeat(64), revokedAt: at },
              },
            },
          });
          const bundle = await rights.export(staff.personId);
          expect(bundle.subjectRequests.map((row) => row.id)).toEqual([
            orphan.id, literal.id,
          ]);
          expect(bundle.member?.walletLinks[0].barcodeAliases).toEqual([
            { revokedAt: at },
          ]);
          expect(bundle.registrations[0].walletProjection).toEqual({
            revision: 7,
            active: true,
            pending: false,
          });
          await tx.accountDeletion.create({
            data: { personId: staff.personId, dueAt: at },
          });
          await rights.purgePersonIfDue(staff.personId);
          expect(
            await tx.manualRightsRequest.count({ where: { id: orphan.id } }),
          ).toBe(0);
          expect(
            await tx.manualRightsRequest.count({ where: { id: unrelated.id } }),
          ).toBe(1);
          expect(
            await tx.person.count({ where: { personId: staff.personId } }),
          ).toBe(0);
          expect(
            await tx.eventRegistration.findUniqueOrThrow({
              where: { registrationId: checked.registrationId },
            }),
          ).toMatchObject({
            status: 'CONFIRMED',
            checkedInAt: at,
            checkedInByMemberId: null,
          });
          expect(
            await tx.eventRegistration.findUniqueOrThrow({
              where: { registrationId: excused.registrationId },
            }),
          ).toMatchObject({
            status: 'EXCUSED',
            excusedAt: at,
            excusedByMemberId: null,
          });
          expect(
            await tx.registrationBlacklistEntry.findUniqueOrThrow({
              where: { entryId: blacklist.entryId },
            }),
          ).toMatchObject({ resolvedAt: at, resolvedByMemberId: null });
          expect(await tx.manualRightsRequest.count({ where: { id: decoy.id } })).toBe(1);
          const decisions = await tx.membershipRequest.findUniqueOrThrow({
            where: { membershipRequestId: application.membershipRequestId },
            include: { committees: true, globalRoles: true },
          });
          expect(decisions.committees[0]).toMatchObject({
            status: 'APPROVED',
            decidedAt: at,
            decidedByMemberId: null,
          });
          expect(decisions.globalRoles[0]).toMatchObject({
            status: 'REJECTED',
            decidedAt: at,
            decidedByMemberId: null,
          });
          expect(
            await tx.walletGuestWithdrawal.findUniqueOrThrow({
              where: { registrationId: own.registrationId },
            }),
          ).toMatchObject({ committeeCode: code, revision: 8 });
          throw rollback;
        },
        { timeout: 15000 },
      ),
    ).rejects.toBe(rollback);
  } finally {
    await db.$disconnect();
  }
});
