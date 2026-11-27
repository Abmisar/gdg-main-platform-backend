import { expect, it, vi } from 'vitest';
import { MembershipDeliveryJob } from './membership-delivery.job.js';

it('reschedules a failed email and records a successful retry under the lease', async () => {
  const row = { id: 17, attempts: 0, committee: {
    status: 'APPROVED', committee: { committeeName: 'Data' }, requestedRole: 'Member',
    membershipRequest: { person: { emailPersonal: 'member@example.test' } },
  } };
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findMany = vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([{ ...row, attempts: 1 }]);
  const sendDecisionEmail = vi.fn().mockRejectedValueOnce(new Error('SMTP unavailable')).mockResolvedValueOnce(undefined);
  const job = new MembershipDeliveryJob({ membershipDecisionDelivery: { findMany, updateMany } } as never, { sendDecisionEmail } as never);
  await job.run();
  expect(updateMany.mock.calls[1][0]).toMatchObject({ where: { id: 17, attempts: 1 }, data: { availableAt: expect.any(Date) } });
  await job.run();
  expect(updateMany.mock.calls[3][0]).toMatchObject({ where: { id: 17, attempts: 2 }, data: { sentAt: expect.any(Date) } });
});
