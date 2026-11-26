import { clientIp, trustedCloudflarePeers } from './common/http/client-ip.js';
import { toNodeHandler } from 'better-auth/node';
import { BetterAuthService } from './auth/better-auth.service.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { getAllowedFrontendOrigins, validateProductionHttpConfig } from './common/http/frontend-origins.js';

const PRIVATE_CACHE_CONTROL = 'private, no-store';

export function configureHttp(app: NestExpressApplication) {
  app.enableShutdownHooks();
  validateProductionHttpConfig();
  const configuredHops = process.env.TRUST_PROXY_HOPS ?? '0';
  const trustProxyHops = Number(configuredHops);
  if (!/^\d+$/.test(configuredHops) || !Number.isSafeInteger(trustProxyHops)) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
  }
  const peers = trustedCloudflarePeers();
  if (peers.length && trustProxyHops !== 0) throw new Error('Set TRUST_PROXY_HOPS=0 with TRUSTED_CF_PROXY_IPS.');
  app.getHttpAdapter().getInstance().set('trust proxy', peers.length ? peers : trustProxyHops);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', PRIVATE_CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.enableCors({
    origin: getAllowedFrontendOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  const auth = app.get(BetterAuthService).auth;
  const authHandler = toNodeHandler(async (request) => {
    const response = await auth.handler(request);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', PRIVATE_CACHE_CONTROL);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
  app.getHttpAdapter().getInstance().all('/api/auth/{*path}', (request: Request, response: Response) => {
    request.headers['x-gdg-client-ip'] = clientIp(request);
    return authHandler(request, response);
  });
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
}
