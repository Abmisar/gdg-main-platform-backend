import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

interface ClientRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: IncomingHttpHeaders;
}

export function trustedCloudflarePeers(): string[] {
  const configured = process.env.TRUSTED_CF_PROXY_IPS;
  if (configured === undefined) return [];
  const peers = configured.split(',').map((address) => address.trim());
  if (peers.some((address) => isIP(address) !== 4)) {
    throw new Error('TRUSTED_CF_PROXY_IPS must contain exact IPv4 peer addresses.');
  }
  return peers;
}

export function clientIp(request: ClientRequest): string {
  const peers = trustedCloudflarePeers();
  const remote = request.socket?.remoteAddress;
  if (!peers.length) return request.ip || remote || 'unknown';
  const peer = remote?.replace(/^::ffff:/i, '');
  const visitor = request.headers['cf-connecting-ip'];
  if (peer && peers.includes(peer) && typeof visitor === 'string' && isIP(visitor)) return visitor;
  return peer || 'unknown';
}
