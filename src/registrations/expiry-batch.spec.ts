import { expect, it, vi } from 'vitest';
import { RegistrationReviewService } from './registration-review.service.js';

it('continues a bounded expiry batch after a failed transaction', async () => {
  const findMany = vi.fn().mockResolvedValue([{ registrationId: 1, eventId: 1 }, { registrationId: 2, eventId: 2 }]);
  const transaction = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ promotedId: 3 });
  const prisma = { eventRegistration: { findMany, findFirst: vi.fn().mockResolvedValue({ confirmationDeadline: new Date(0) }) }, $transaction: transaction };
  const result = await new RegistrationReviewService(prisma as never, {} as never).cancelOverdueConfirmationOffers(new Date(3000));
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  expect(result).toEqual({ cancelled: 1, promoted: [3] });
});
