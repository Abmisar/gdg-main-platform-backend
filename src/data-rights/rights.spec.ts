import { validate } from 'class-validator';
import { SubjectRequestDto } from './rights.dto.js';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RightsService } from './rights.service.js';

describe('manual rights requests', () => {
  const actor = { personId: 11, memberId: 12 };
  function setup() {
    const tx = {
      person: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue({ personId: 31 }) },
      manualRightsRequest: { create: vi.fn().mockResolvedValue({ id: 3 }) },
      rightsAudit: { create: vi.fn() },
    };
    const db = {
      memberRole: { findFirst: vi.fn().mockResolvedValue({ id: 1 }) },
      person: { findUnique: vi.fn().mockResolvedValue({ personId: 31 }) },
      $transaction: vi.fn((fn) => fn(tx)),
    };
    return {
      service: new RightsService(db as unknown as PrismaService),
      db,
      tx,
    };
  }

  it('calculates the deadline from receipt and assigns the authenticated handler', async () => {
    const { service, tx } = setup();
    await service.logManual(actor, {
      kind: 'complaint',
      personId: 31,
      receivedAt: '2024-01-31T08:00:00Z',
    });
    expect(tx.manualRightsRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dueAt: new Date('2024-03-01T08:00:00Z'),
        personId: 31,
        handlerId: actor.personId,
      }),
    });
  });

  it('takes the subject and receipt time from the server for a self-service request', async () => {
    const { service, tx } = setup();
    await service.submitRequest(41, { kind: 'other', details: ' Synthetic request ' });
    const { data } = tx.manualRightsRequest.create.mock.calls[0][0];
    expect(data).toMatchObject({ personId: 41, kind: 'other', details: 'Synthetic request' });
    expect(data.handlerId).toBeUndefined();
    expect(data.dueAt.getTime() - data.receivedAt.getTime()).toBe(30 * 86400000);
    expect(tx.rightsAudit.create).toHaveBeenCalledWith({ data: { personId: 41, action: 'manual_request_3_received' } });
  });

  it('requires explicit disambiguation and checks that subject directly', async () => {
    const { service, tx } = setup();
    const email = 'example_%@university.example.test';
    const input = { kind: 'complaint', contactEmail: email };
    tx.person.findMany.mockResolvedValue([{ personId: 1 }, { personId: 2 }]);
    await expect(service.logManual(actor, input)).rejects.toMatchObject({ status: 409 });
    expect(tx.manualRightsRequest.create).not.toHaveBeenCalled();
    tx.person.findUnique.mockResolvedValue({ emailUniversity: email.toUpperCase(), emailUniversityVerifiedAt: new Date() });
    await service.logManual(actor, { ...input, personId: 3 });
    expect(tx.person.findMany).toHaveBeenCalledOnce();
    expect(tx.manualRightsRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ personId: 3 }) });
    await expect(service.logManual(actor, { ...input, personId: 3, contactEmail: 'exampleXY@university.example.test' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('requires active leadership for manual records and a resolution to close them', async () => {
    const { service, db } = setup();
    await expect(
      service.updateManual(actor, 123, { status: 'RESOLVED', resolution: ' ' }),
    ).rejects.toThrow(BadRequestException);
    db.memberRole.findFirst.mockResolvedValue(null);
    await expect(service.listManual(actor)).rejects.toThrow(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('current consent', () => {
  it('prompts a legacy account, accepts current documents and ignores superseded versions', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ document: 'privacy' }])
      .mockResolvedValueOnce([{ document: 'privacy' }, { document: 'terms' }]);
    const createMany = vi.fn();
    const service = new RightsService({
      consentRecord: { findMany, createMany },
    } as unknown as PrismaService);
    expect((await service.consentStatus(4)).missing).toEqual([
      'privacy',
      'terms',
    ]);
    expect((await service.consentStatus(4)).missing).toEqual(['terms']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId: 4,
          OR: [
            { document: 'privacy', version: '2' },
            { document: 'terms', version: '2' },
          ],
        },
      }),
    );
    const evidence = ['privacy', 'terms'].map((document) => ({
      document,
      version: '2' as const,
      locale: 'ar',
      acceptedAt: new Date().toISOString(),
      purpose: 'renewal',
      ipHash: 'a'.repeat(64),
      userAgentHash: 'b'.repeat(64),
    }));
    expect((await service.acceptConsent(4, evidence)).requiresConsent).toBe(
      false,
    );
    expect(createMany).toHaveBeenCalledWith({
      data: evidence.map((row) => ({ ...row, personId: 4 })),
    });
  });
});

describe('optional privacy request details', () => {
  it.each([null, '', '  '])('rejects provided empty details %#', async details => {
    expect(await validate(Object.assign(new SubjectRequestDto(), { kind: 'other', details }))).toHaveLength(1);
  });
  it('accepts an omitted description', async () => {
    expect(await validate(Object.assign(new SubjectRequestDto(), { kind: 'other' }))).toEqual([]);
  });
});
