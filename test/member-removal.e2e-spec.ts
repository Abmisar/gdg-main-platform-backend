import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { CommitteeDashboardService } from '../src/committee-dashboard/committee-dashboard.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { schemaTestTarget } from './schema-test-target.js';

process.env.DATABASE_URL = schemaTestTarget(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);

describe('member removal with PostgreSQL', () => {
  it.each([false, true])('preserves shared records and rolls back on delete failure: %s', async (failDelete) => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();
    await app.init();
    const db = app.get(PrismaService);
    const service = app.get(CommitteeDashboardService);
    const id = randomUUID();
    const email = `${id}@example.test`;
    const auth = await db.authUser.create({ data: { id, name: 'Synthetic target', email } });
    const account = await db.authAccount.create({ data: { id: randomUUID(), accountId: id, providerId: 'credential', userId: id } });
    const targetPerson = await db.person.create({ data: { fullName: 'Synthetic target', emailPersonal: email, authUserId: id } });
    const actorPerson = await db.person.create({ data: { fullName: 'Synthetic actor' } });
    const otherPerson = await db.person.create({ data: { fullName: 'Synthetic recipient' } });
    const target = await db.member.create({ data: { personId: targetPerson.personId } });
    const actor = await db.member.create({ data: { personId: actorPerson.personId } });
    const other = await db.member.create({ data: { personId: otherPerson.personId } });
    const committee = await db.committee.create({ data: { committeeCode: `T${id.replaceAll('-', '').slice(0, 18).toUpperCase()}`, committeeName: id } });
    await db.memberRole.create({ data: { memberId: actor.memberId, roleCode: 'GROUP_LEADER' } });
    await db.memberCommittee.createMany({ data: [{ memberId: target.memberId, committeeId: committee.committeeId }, { memberId: other.memberId, committeeId: committee.committeeId }] });
    const personal = await db.committeePointEntry.create({ data: { memberId: target.memberId, committeeId: committee.committeeId, awardedByMemberId: actor.memberId, pointsDelta: 1, reason: 'Synthetic' } });
    const award = await db.committeePointEntry.create({ data: { memberId: other.memberId, committeeId: committee.committeeId, awardedByMemberId: target.memberId, pointsDelta: 1, reason: 'Synthetic' } });
    const event = await db.event.create({ data: { name: 'Synthetic event', capacity: 1, startsAt: new Date('2030-01-02T10:00:00Z'), endsAt: new Date('2030-01-02T12:00:00Z'), registrationDeadline: new Date('2030-01-01T12:00:00Z'), committeeId: committee.committeeId, createdByMemberId: target.memberId } });
    const trigger = `test_member_delete_${id.replaceAll('-', '')}`;
    try {
      if (failDelete) {
        await db.$executeRawUnsafe(`CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.member_id = ${target.memberId} THEN RAISE EXCEPTION 'test member delete failure'; END IF; RETURN OLD; END $$`);
        await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE DELETE ON member FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`);
      }
      const removal = service.removeClubPerson({ personId: actorPerson.personId, memberId: actor.memberId }, { email });
      if (failDelete) await expect(removal).rejects.toThrow('test member delete failure');
      else await expect(removal).resolves.toBeDefined();
      expect(await db.member.findUnique({ where: { memberId: target.memberId } })).toEqual(failDelete ? expect.objectContaining({ memberId: target.memberId }) : null);
      expect(await db.memberCommittee.findUnique({ where: { memberId_committeeId: { memberId: target.memberId, committeeId: committee.committeeId } } })).toEqual(failDelete ? expect.objectContaining({ memberId: target.memberId }) : null);
      expect(await db.committeePointEntry.findUnique({ where: { pointEntryId: personal.pointEntryId } })).toEqual(failDelete ? expect.objectContaining({ memberId: target.memberId }) : null);
      expect(await db.person.findUnique({ where: { personId: targetPerson.personId } })).toEqual(expect.objectContaining({ authUserId: id }));
      expect(await db.authUser.findUnique({ where: { id: auth.id } })).not.toBeNull();
      expect(await db.authAccount.findUnique({ where: { id: account.id } })).not.toBeNull();
      expect(await db.event.findUnique({ where: { eventId: event.eventId } })).toEqual(expect.objectContaining({ eventId: event.eventId, createdByMemberId: failDelete ? target.memberId : null }));
      expect(await db.committeePointEntry.findUnique({ where: { pointEntryId: award.pointEntryId } })).toEqual(expect.objectContaining({ awardedByMemberId: failDelete ? target.memberId : null }));
    } finally {
      if (failDelete) {
        await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON member`);
        await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${trigger}"()`);
      }
      await db.committeePointEntry.deleteMany({ where: { committeeId: committee.committeeId } });
      await db.event.deleteMany({ where: { committeeId: committee.committeeId } });
      await db.memberCommittee.deleteMany({ where: { committeeId: committee.committeeId } });
      await db.memberRole.deleteMany({ where: { memberId: actor.memberId } });
      await db.member.deleteMany({ where: { memberId: { in: [target.memberId, actor.memberId, other.memberId] } } });
      await db.committee.delete({ where: { committeeId: committee.committeeId } });
      await db.person.deleteMany({ where: { personId: { in: [targetPerson.personId, actorPerson.personId, otherPerson.personId] } } });
      await db.authUser.delete({ where: { id } });
      await app.close();
    }
  });
});
