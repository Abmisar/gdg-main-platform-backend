import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { CommitteeDashboardService } from '../committee-dashboard/committee-dashboard.service.js';
import { RegistrationsController } from '../registrations/registrations.controller.js';
import type { CommitteeAccessService } from '../registrations/committee-access.service.js';
import type { PrismaService } from './prisma.service.js';
import { ReadAuditInterceptor } from './read-audit.js';

it('records the exported count without copying search terms or result data', async () => {
  const create = vi.fn().mockResolvedValue({});
  const audit = new ReadAuditInterceptor(new Reflector(), {
    staffReadAudit: { createMany: create },
  } as unknown as PrismaService);
  const context = {
    getHandler: () => RegistrationsController.prototype.getDataEventReport,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { memberId: 12 },
        params: { eventId: '23' },
        query: { scope: 'ignore' },
      }),
    }),
  } as unknown as ExecutionContext;
  const response = { data: { items: [{ name: 'Synthetic Member' }] } };
  const next = { handle: () => of(response) };
  expect(await lastValueFrom(audit.intercept(context, next))).toBe(response);
  expect(create).toHaveBeenCalledWith({
    data: {
      actorMemberId: 12,
      scope: '23',
      action: 'registrants.export',
      count: 1,
      status: 'DISCLOSED',
    },
  });
  await expect(
    lastValueFrom(
      audit.intercept(context, {
        handle: () => throwError(() => new Error('read failed')),
      }),
    ),
  ).rejects.toThrow('read failed');
  expect(create).toHaveBeenLastCalledWith({
    data: {
      actorMemberId: 12,
      action: 'registrants.export',
      scope: '23',
      status: 'FAILED',
      count: 0,
    },
  });
  create.mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(lastValueFrom(audit.intercept(context, next))).rejects.toThrow(
    'Audit unavailable',
  );
});

it('requires the dedicated leadership permission before reading audit rows', async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const access = { hasGlobalPermission: vi.fn().mockResolvedValue(false) };
  const service = new CommitteeDashboardService(
    { staffReadAudit: { findMany } } as unknown as PrismaService,
    access as unknown as CommitteeAccessService,
    undefined,
    undefined,
    { recent: findMany } as any,
  );
  const actor = {
    memberId: 12,
    personId: 9,
    email: 'synthetic@example.test',
    fromEmailLink: false,
  };
  await expect(service.listStaffReads(actor)).rejects.toBeInstanceOf(
    ForbiddenException,
  );
  expect(findMany).not.toHaveBeenCalled();
  access.hasGlobalPermission.mockResolvedValueOnce(true);
  expect(await service.listStaffReads(actor)).toEqual([]);
  expect(access.hasGlobalPermission).toHaveBeenCalledWith(
    12,
    'audit.staff_reads.view',
  );
});
