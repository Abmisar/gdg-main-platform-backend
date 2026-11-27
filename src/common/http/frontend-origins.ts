const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3000';

function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin === 'null' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error('Frontend origins must be bare HTTP or HTTPS origins.');
  }
}

export function getAllowedFrontendOrigins(): string[] {
  const configuredOrigins = process.env.FRONTEND_ORIGINS?.split(',') ?? [];
  const primaryOrigin = process.env.FRONTEND_URL?.trim();
  const defaultOrigins = primaryOrigin
    ? [primaryOrigin]
    : process.env.NODE_ENV === 'production'
      ? []
      : [DEFAULT_FRONTEND_ORIGIN];
  const origins = [...defaultOrigins, ...configuredOrigins]
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  return [...new Set(origins)];
}

export function validateProductionHttpConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!frontendUrl || !normalizeOrigin(frontendUrl).startsWith('https://')) {
    throw new Error('FRONTEND_URL must be a bare HTTPS origin in production.');
  }
  if (getAllowedFrontendOrigins().some((origin) => !origin.startsWith('https://'))) {
    throw new Error('All FRONTEND_ORIGINS must use HTTPS in production.');
  }

  const configuredAuthUrl = process.env.BETTER_AUTH_URL;
  if (configuredAuthUrl !== undefined) {
    const authUrl = new URL(configuredAuthUrl);
    if (
      authUrl.origin !== normalizeOrigin(frontendUrl) ||
      !['/', '/api/auth', '/api/auth/'].includes(authUrl.pathname) ||
      authUrl.username || authUrl.password || authUrl.search || authUrl.hash
    ) {
      throw new Error('BETTER_AUTH_URL must use the public frontend HTTPS origin in production.');
    }
  }

  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  if (secret.trim().length < 32 || /change[_ -]?me|placeholder|local[-_]test/i.test(secret)) {
    throw new Error('BETTER_AUTH_SECRET must be a non-example secret of at least 32 characters.');
  }

  if (process.env.TRUST_PROXY_HOPS === undefined) {
    throw new Error('TRUST_PROXY_HOPS must be explicitly configured in production.');
  }
}
