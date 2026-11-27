import { ServiceUnavailableException } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

it('reports process and database health independently', async () => {
  const checkDatabaseConnection = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('fixture'));
  const health = new HealthController({ checkDatabaseConnection } as unknown as PrismaService);
  expect(health.live()).toEqual({ status: 'ok' });
  expect(checkDatabaseConnection).not.toHaveBeenCalled();
  await expect(health.ready()).resolves.toEqual({ status: 'ready' });
  await expect(health.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
});
