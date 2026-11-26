import { clientIp } from './client-ip.js';

const fixtureAddress = (host: number) => [192, 0, 2, host].join('.');
const tunnel = fixtureAddress(2);
const frontend = fixtureAddress(3);

beforeEach(() => vi.stubEnv('TRUSTED_CF_PROXY_IPS', [tunnel, frontend].join(',')));
afterEach(() => vi.unstubAllEnvs());

function resolve(peer: string, visitor: string) {
  return clientIp({
    ip: fixtureAddress(99),
    socket: { remoteAddress: peer },
    headers: { 'cf-connecting-ip': visitor, 'x-forwarded-for': fixtureAddress(99) },
  });
}

it.each([['direct API', tunnel], ['frontend rewrite', '::ffff:' + frontend]])(
  'preserves distinct visitors through the %s peer',
  (_route, peer) => {
    for (const visitor of [fixtureAddress(11), fixtureAddress(12)]) expect(resolve(peer, visitor)).toBe(visitor);
  },
);

it('ignores both forwarded addresses from an untrusted peer', () => {
  expect(resolve(fixtureAddress(4), fixtureAddress(11))).toBe(fixtureAddress(4));
});

it('uses the socket peer when the connector passes multiple visitor addresses', () => {
  expect(resolve(tunnel, [fixtureAddress(11), fixtureAddress(12)].join(','))).toBe(tunnel);
});
