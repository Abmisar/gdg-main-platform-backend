import { PreconditionFailedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RightsController } from './rights.controller.js';
import type { RightsService } from './rights.service.js';

describe('privacy account precondition', () => {
  it('rejects every stale write before applying it to the current account', async () => {
    const rights = {
      correct: vi.fn(),
      requestDeletion: vi.fn(),
      cancelDeletion: vi.fn(),
      submitRequest: vi.fn(),
      acceptConsent: vi.fn(),
    };
    const controller = new RightsController(rights as unknown as RightsService);
    const current = { personId: 21 };
    const expected = '12';

    await expect(controller.correct(current, { fullName: 'Changed' }, expected)).rejects.toBeInstanceOf(PreconditionFailedException);
    await expect(controller.requestDeletion(current, expected)).rejects.toBeInstanceOf(PreconditionFailedException);
    await expect(controller.cancelDeletion(current, expected)).rejects.toBeInstanceOf(PreconditionFailedException);
    await expect(controller.submitRequest(current, { kind: 'objection' }, expected)).rejects.toBeInstanceOf(PreconditionFailedException);
    await expect(controller.acceptConsent(current, {} as never, { consent: { privacy: '2', terms: '2', locale: 'en' } }, expected)).rejects.toBeInstanceOf(PreconditionFailedException);
    for (const operation of Object.values(rights)) expect(operation).not.toHaveBeenCalled();

    await controller.correct(current, { fullName: 'Changed' }, '21');
    expect(rights.correct).toHaveBeenCalledWith(21, { fullName: 'Changed' });
  });
});
