import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { removeMember } from '../committee-dashboard/remove-member.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/current-user.js';
import type {
  CorrectProfileDto,
  ManualRequestDto,
  ResolveRequestDto,
  SubjectRequestDto,
} from './rights.dto.js';

import { documentVersions, type ConsentEvidence } from './consent.js';
import type { Prisma } from '../generated/prisma/client.js';

async function verifiedOwners(tx: Prisma.TransactionClient, email: string) {
  return tx.person.findMany({
    where: {
      OR: [
        { emailPersonal: email, emailPersonalVerifiedAt: { not: null } },
        { emailUniversity: email, emailUniversityVerifiedAt: { not: null } },
      ],
    },
    select: { personId: true },
    take: 2,
  });
}

async function ownedManualRequests(
  tx: Prisma.TransactionClient,
  person: {
    personId: number;
    emailPersonal: string | null;
    emailUniversity: string | null;
    emailPersonalVerifiedAt: Date | null;
    emailUniversityVerifiedAt: Date | null;
  },
): Promise<Prisma.ManualRightsRequestWhereInput> {
  const emails = new Set([
    person.emailPersonalVerifiedAt && person.emailPersonal,
    person.emailUniversityVerifiedAt && person.emailUniversity,
  ]);
  const matches: Prisma.ManualRightsRequestWhereInput[] = [
    { personId: person.personId },
  ];
  for (const email of emails) {
    if (!email) continue;
    const owners = await verifiedOwners(tx, email);
    if (owners.length === 1 && owners[0].personId === person.personId) {
      matches.push({ personId: null, contactEmail: email });
    }
  }
  return { OR: matches };
}

export async function erasePerson(tx: Prisma.TransactionClient, personId: number) {
  const person = await tx.person.findUniqueOrThrow({
    where: { personId },
    include: { member: { select: { memberId: true } } },
  });
  if (person.member) await removeMember(tx, person.member);
  await tx.registrationBlacklistEntry.deleteMany({
    where: { registration: { personId } },
  });
  await tx.eventRegistration.deleteMany({ where: { personId } });
  await tx.membershipRequest.deleteMany({ where: { personId } });
  await tx.nonMemberRegistration.deleteMany({ where: { personId } });
  await tx.manualRightsRequest.deleteMany({
    where: await ownedManualRequests(tx, person),
  });
  if (person.authUserId) {
    await tx.signupVerification.deleteMany({
      where: { authUserId: person.authUserId },
    });
    await tx.authVerification.deleteMany({
      where: { value: person.authUserId },
    });
    await tx.authUser.deleteMany({ where: { id: person.authUserId } });
  }
  await tx.person.delete({ where: { personId } });
  await tx.deletionTombstone.create({ data: {} });
}

const day = 86_400_000;

@Injectable()
export class RightsService {
  private readonly logger = new Logger(RightsService.name);
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async consentStatus(personId: number) {
    const accepted = await this.db.consentRecord.findMany({
      where: {
        personId,
        OR: Object.entries(documentVersions).map(([document, version]) => ({
          document,
          version,
        })),
      },
      distinct: ['document'],
      select: { document: true },
    });
    const missing = Object.keys(documentVersions).filter(
      (key) => !accepted.some((row) => row.document === key),
    );
    return {
      versions: documentVersions,
      missing,
      requiresConsent: missing.length > 0,
    };
  }

  async acceptConsent(personId: number, evidence: ConsentEvidence) {
    await this.db.consentRecord.createMany({
      data: evidence.map((row) => ({ ...row, personId })),
    });
    return this.consentStatus(personId);
  }

  async export(personId: number) {
    return this.db.$transaction(
      async (tx) => {
        await tx.rightsAudit.create({ data: { personId, action: 'export' } });
        const profile = await tx.person.findUniqueOrThrow({
          where: { personId },
          select: {
            personId: true,
            authUserId: true,
            fullName: true,
            emailPersonal: true,
            emailUniversity: true,
            emailPersonalVerifiedAt: true,
            emailUniversityVerifiedAt: true,
            phoneNumber: true,
            university: true,
            branch: true,
            major: true,
            gender: true,
            profileImageUrl: true,
            bio: true,
            githubUrl: true,
            portfolioUrl: true,
            xUrl: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            emailIdentities: {
              select: { email: true, kind: true, createdAt: true },
            },
            nonMemberRegistration: true,
            pendingSignup: true,
            membershipRequest: {
              include: { committees: true, globalRoles: true },
            },
            member: {
              include: {
                roleAssignments: true,
                skills: { include: { skill: true } },
                committees: { include: { pointsReceived: true } },
                createdEvents: { select: { eventId: true, name: true } },
                publishedAnnouncements: {
                  select: { announcementId: true, title: true },
                },
                assignedRoles: { select: { id: true, roleCode: true } },
                reviewedRegistrations: {
                  select: { registrationId: true, approvedAt: true },
                },
                checkedInRegistrations: {
                  select: { registrationId: true, checkedInAt: true },
                },
                excusedRegistrations: {
                  select: { registrationId: true, excusedAt: true },
                },
                resolvedBlacklistEntries: {
                  select: { entryId: true, resolvedAt: true },
                },
                reviewedMembershipCommittees: {
                  select: {
                    membershipRequestCommitteeId: true,
                    decidedAt: true,
                  },
                },
                reviewedGlobalMembershipRoles: {
                  select: {
                    membershipRequestGlobalRoleId: true,
                    decidedAt: true,
                  },
                },
                awardedCommitteePoints: {
                  select: { pointEntryId: true, pointsDelta: true },
                },
                globalPointsAwarded: {
                  select: { pointEntryId: true, pointsDelta: true },
                },
                createdCommitteeTasks: {
                  select: { taskId: true, title: true },
                },
                assignedCommitteeTasks: true,
                globalPointsReceived: true,
                walletLinks: {
                  include: { barcodeAliases: { select: { revokedAt: true } } },
                },
              },
            },
            registrations: {
              omit: {
                attendanceTokenHash: true,
                attendanceTokenEncrypted: true,
              },
              include: {
                walletProjection: {
                  select: { revision: true, active: true, pending: true },
                },
                answers: true,
                blacklistEntries: true,
                emailDeliveries: true,
              },
            },
            consents: true,
            deletion: true,
            rightsAudit: { orderBy: { id: 'asc' } },

            emailVerificationChallenges: {
              select: {
                purpose: true,
                email: true,
                sentAt: true,
                expiresAt: true,
                consumedAt: true,
              },
            },
            handledRequests: { select: { id: true, status: true } },
          },
        });
        const { authUserId, ...data } = profile;
        const account =
          authUserId &&
          (await tx.authUser.findUnique({
            where: { id: authUserId },
            select: {
              name: true,
              email: true,
              emailVerified: true,
              image: true,
              locale: true,
              createdAt: true,
              updatedAt: true,
              accounts: { select: { providerId: true, createdAt: true } },
              sessions: {
                select: {
                  createdAt: true,
                  updatedAt: true,
                  expiresAt: true,
                  ipAddress: true,
                  userAgent: true,
                },
              },
            },
          }));
        const subjectRequests = await tx.manualRightsRequest.findMany({
          where: await ownedManualRequests(tx, profile),
          orderBy: { id: 'asc' },
        });
        return { ...data, account, subjectRequests };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async correct(personId: number, input: CorrectProfileDto) {
    if (!Object.keys(input).length || Object.values(input).includes(null))
      throw new BadRequestException('Supply editable profile fields.');
    return this.db.$transaction(async (tx) => {
      const person = await tx.person.update({
        where: { personId },
        data: {
          phoneNumber: input.phoneNumber,
          fullName: input.fullName?.trim(),
          major: input.major?.trim(),
        },
        select: {
          fullName: true,
          phoneNumber: true,
          major: true,
          authUserId: true,
        },
      });
      if (input.fullName && person.authUserId)
        await tx.authUser.update({
          where: { id: person.authUserId },
          data: { name: person.fullName },
        });
      await tx.rightsAudit.create({
        data: { personId, action: 'profile_corrected' },
      });
      return {
        fullName: person.fullName,
        phoneNumber: person.phoneNumber,
        major: person.major,
      };
    });
  }

  async requestDeletion(personId: number) {
    return this.db.$transaction(async (tx) => {
      const created = await tx.accountDeletion.createMany({
        data: { personId, dueAt: new Date(Date.now() + 14 * day) },
        skipDuplicates: true,
      });
      if (created.count)
        await tx.rightsAudit.create({
          data: { personId, action: 'deletion_requested' },
        });
      return tx.accountDeletion.findUniqueOrThrow({ where: { personId } });
    });
  }

  async cancelDeletion(personId: number) {
    await this.db.$transaction(async (tx) => {
      const cancelled = await tx.accountDeletion.deleteMany({
        where: { personId, dueAt: { gt: new Date() } },
      });
      if (!cancelled.count)
        throw new ConflictException('No deletion is within its grace period.');
      await tx.rightsAudit.create({
        data: { personId, action: 'deletion_cancelled' },
      });
    });
  }

  @Cron('0 * * * *')
  async purgeDue() {
    const due = await this.db.accountDeletion.findMany({
      where: { dueAt: { lte: new Date() } },
      select: { personId: true },
    });
    for (const { personId } of due) {
      try {
        await this.purgePersonIfDue(personId);
      } catch (error) {
        this.logger.warn({
          event: 'account_deletion_deferred',
          reason:
            error instanceof ConflictException
              ? 'leadership_transfer_required'
              : 'transaction_failed',
        });
      }
    }
  }

  async purgePersonIfDue(personId: number) {
    await this.db.$transaction(async (tx) => {
      const claimed = await tx.accountDeletion.deleteMany({
        where: { personId, dueAt: { lte: new Date() } },
      });
      if (!claimed.count) return;
      await erasePerson(tx, personId);
    });
  }

  async requireLeadership(user: AuthenticatedUser) {
    const today = new Date(
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }),
    );
    if (
      !user.memberId ||
      !(await this.db.memberRole.findFirst({
        where: {
          memberId: user.memberId,
          member: {
            isActive: true,
            person: { personId: user.personId, isActive: true },
          },
          roleCode: { in: ['GROUP_LEADER', 'GROUP_CO_LEADER'] },
          AND: [
            { OR: [{ startsOn: null }, { startsOn: { lte: today } }] },
            { OR: [{ endsOn: null }, { endsOn: { gte: today } }] },
          ],
        },
      }))
    )
      throw new ForbiddenException();
  }

  async logManual(user: AuthenticatedUser, input: ManualRequestDto) {
    await this.requireLeadership(user);
    if (!input.personId && !input.contactEmail)
      throw new BadRequestException('Supply a person ID or contact email.');
    const receivedAt = input.receivedAt
      ? new Date(input.receivedAt)
      : new Date();
    if (receivedAt.getTime() > Date.now())
      throw new BadRequestException('Received date must be in the past.');
    const contactEmail = input.contactEmail?.trim().toLowerCase();
    return this.db.$transaction(async (tx) => {
      let subject = input.personId ?? null;
      if (input.personId) {
        const person = await tx.person.findUnique({ where: { personId: input.personId }, select: {
          emailPersonal: true, emailPersonalVerifiedAt: true, emailUniversity: true, emailUniversityVerifiedAt: true,
        } });
        if (!person) throw new NotFoundException();
        const addresses = [
          person.emailPersonalVerifiedAt && person.emailPersonal?.trim().toLowerCase(),
          person.emailUniversityVerifiedAt && person.emailUniversity?.trim().toLowerCase(),
        ];
        if (contactEmail && !addresses.includes(contactEmail)) {
          throw new BadRequestException('Contact email must be verified for the selected subject.');
        }
      } else if (contactEmail) {
        const owners = await verifiedOwners(tx, contactEmail);
        if (owners.length > 1) throw new ConflictException('Select a subject for this shared address.');
        subject = owners[0]?.personId ?? null;
      }
      return this.recordRequest(tx, { kind: input.kind, personId: subject, contactEmail, handlerId: user.personId, receivedAt });
    });
  }

  private async recordRequest(tx: Prisma.TransactionClient, input: {
    kind: string; personId: number | null; receivedAt: Date; details?: string; contactEmail?: string; handlerId?: number;
  }) {
    const item = await tx.manualRightsRequest.create({ data: { ...input, dueAt: new Date(input.receivedAt.getTime() + 30 * day) } });
    if (input.personId) await tx.rightsAudit.create({ data: { personId: input.personId, action: `manual_request_${item.id}_received` } });
    return item;
  }

  async submitRequest(personId: number, input: SubjectRequestDto) {
    const item = await this.db.$transaction(tx => this.recordRequest(tx, {
      personId, kind: input.kind, details: input.details?.trim(), receivedAt: new Date(),
    }));
    const { id, kind, details, status, receivedAt, dueAt, resolution } = item;
    return { id, kind, details, status, receivedAt, dueAt, resolution };
  }

  async ownRequests(personId: number) {
    return this.db.$transaction(async tx => {
      const subject = await tx.person.findUniqueOrThrow({ where: { personId }, select: {
        personId: true, emailPersonal: true, emailPersonalVerifiedAt: true, emailUniversity: true, emailUniversityVerifiedAt: true,
      } });
      return tx.manualRightsRequest.findMany({ where: await ownedManualRequests(tx, subject),
        select: { id: true, kind: true, details: true, status: true, receivedAt: true, dueAt: true, resolution: true },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      });
    }, { isolationLevel: 'RepeatableRead' });
  }

  deletionStatus(personId: number) {
    return this.db.accountDeletion.findUnique({ where: { personId }, select: { personId: true, dueAt: true } });
  }

  async listManual(user: AuthenticatedUser) {
    await this.requireLeadership(user);
    return this.db.manualRightsRequest.findMany({
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
  }

  async updateManual(
    user: AuthenticatedUser,
    id: number,
    input: ResolveRequestDto,
  ) {
    await this.requireLeadership(user);
    if (input.status === 'RESOLVED' && !input.resolution?.trim())
      throw new BadRequestException('Supply a resolution.');
    await this.db.$transaction(async (tx) => {
      const [updated] = await tx.manualRightsRequest.updateManyAndReturn({
        where: { id },
        data: {
          status: input.status,
          resolution: input.resolution?.trim() ?? null,
          handlerId: user.personId,
        },
        select: { personId: true },
      });
      if (!updated) throw new NotFoundException();
      if (updated.personId)
        await tx.rightsAudit.create({
          data: {
            personId: updated.personId,
            action: `manual_request_${id}_${input.status.toLowerCase()}`,
          },
        });
    });
  }

  @Cron('0 8 * * *', { timeZone: 'Asia/Riyadh' })
  async remind() {
    const items = await this.db.manualRightsRequest.findMany({
      where: {
        status: { not: 'RESOLVED' },
        dueAt: { lte: new Date(Date.now() + 7 * day) },
      },
      select: { id: true, dueAt: true },
    });
    for (const item of items)
      this.logger.log({ event: 'rights_request_due', ...item });
  }
}
