import { expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';

it('requires the application event projection even on an empty database', async () => {
  const findFirst = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('missing column'));
  const controller = new HealthController({ event: { findFirst } } as never);
  expect(controller.live()).toEqual({ status: 'ok' });
  expect(findFirst).not.toHaveBeenCalled();
  await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
  expect(findFirst).toHaveBeenCalledWith({ select: { eventId: true, confirmationWindowHours: true } });
  await expect(controller.ready()).rejects.toThrow();
});
