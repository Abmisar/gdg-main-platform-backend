import { ConfigService } from '@nestjs/config';
import { GuestWalletRelayService } from './guest-wallet-relay.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AttendanceTokenService } from '../event-registrations/attendance-token.service.js';
import type { RegistrationEmailDeliveryService } from './registration-email-delivery.service.js';

it('retries deleted passes until Wallet acknowledges the inactive revision', async () => {
  const row = { registrationId: 10, revision: 4, committeeCode: 'PR' };
  const queue = {
    findMany: vi.fn().mockResolvedValue([row]),
    deleteMany: vi.fn(),
  };
  const db = {
    walletGuestWithdrawal: queue,
    eventRegistration: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const relay = new GuestWalletRelayService(
    db as unknown as PrismaService,
    new ConfigService({
      WALLET_GUEST_RELAY_ORIGIN: 'https://wallet.example.test',
      WALLET_GUEST_COMMITTEES: 'PR',
      WALLET_GUEST_RELAY_TOKEN: 'a'.repeat(32),
    }),
    {} as AttendanceTokenService,
    {} as RegistrationEmailDeliveryService,
  );
  const send = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ revision: 3 }))
    .mockResolvedValueOnce(Response.json({ revision: 4 }));
  vi.stubGlobal('fetch', send);
  try {
    await relay.sync();
    await relay.sync();
    expect(queue.deleteMany).not.toHaveBeenCalled();
    await relay.sync();
    expect(queue.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { registrationId: 10, revision: 4 },
    });
    expect(send.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual(
      Array(3).fill({ active: false, expired: false, revision: 4 }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
