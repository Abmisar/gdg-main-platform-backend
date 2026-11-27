import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

function decodeKey(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new Error('Expected a base64 AES-256 key');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value)
    throw new Error('Invalid key encoding');
  return bytes;
}

function normalizePhone(value: string) {
  const digits = value
    .replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 15))
    .replace(/[\p{Z}\p{P}\p{Cf}\s+]/gu, '');
  if (/^05\d{8}$/.test(digits)) return '966' + digits.slice(1);
  return digits.replace(/^00/, '');
}

export class FieldCipher {
  private readonly keys = new Map<string, Buffer>();
  private readonly indexKey: Buffer;
  private readonly active: string;

  constructor(env: NodeJS.ProcessEnv) {
    this.active = env.FIELD_ENCRYPTION_ACTIVE_VERSION ?? '';
    this.indexKey = decodeKey(env.FIELD_BLIND_INDEX_KEY);
    let entries: unknown;
    try {
      entries = JSON.parse(env.FIELD_ENCRYPTION_KEYS ?? '{}');
    } catch {
      throw new Error('Invalid field key configuration');
    }
    if (!entries || typeof entries !== 'object' || Array.isArray(entries))
      throw new Error('Invalid field key configuration');
    for (const [id, value] of Object.entries(entries)) {
      const bytes = decodeKey(value);
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || bytes.equals(this.indexKey))
        throw new Error('Invalid field key configuration');
      this.keys.set(id, bytes);
    }
    if (!this.keys.has(this.active))
      throw new Error('Missing active field key');
  }

  encrypt(field: string, row: string | number, value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.keys.get(this.active)!,
      iv,
    );
    cipher.setAAD(this.aad(this.active, field, row));
    const payload = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return [
      'f2',
      this.active,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      payload.toString('base64url'),
    ].join('.');
  }

  decrypt(field: string, row: string | number, envelope: string) {
    const parts = envelope.split('.');
    const [format, version, iv, tag, payload] = parts;
    const key = this.keys.get(version);
    if (
      format !== 'f2' ||
      !key ||
      parts.length !== 5 ||
      iv.length !== 16 ||
      tag.length !== 22 ||
      !payload
    )
      throw new Error('Invalid field envelope');
    const decode = (part: string) => {
      const bytes = Buffer.from(part, 'base64url');
      if (bytes.toString('base64url') !== part)
        throw new Error('Invalid field encoding');
      return bytes;
    };
    const cipher = createDecipheriv('aes-256-gcm', key, decode(iv));
    cipher.setAAD(this.aad(version, field, row));
    cipher.setAuthTag(decode(tag));
    return JSON.parse(
      Buffer.concat([
        cipher.update(decode(payload)),
        cipher.final(),
      ]).toString(),
    );
  }

  private aad(version: string, field: string, row: string | number) {
    if (!((typeof row === 'string' && row.length) || Number.isSafeInteger(row)))
      throw new Error('Missing field row identity');
    return Buffer.from(
      JSON.stringify(['f2', version, field, String(row).toLowerCase()]),
    );
  }

  isCurrent(envelope: string) {
    return envelope.split('.')[1] === this.active;
  }

  index(field: string, value: string) {
    const normalized = field.endsWith('.phoneNumber')
      ? normalizePhone(value)
      : /\.(?:email(?:Personal|University)?|contactEmail)$/.test(field)
        ? value.trim().toLowerCase()
        : value;
    return createHmac(
      'sha256',
      Buffer.from(
        hkdfSync('sha256', this.indexKey, 'gdg-field-index-v2', field, 32),
      ),
    )
      .update(field + '\0' + normalized)
      .digest('hex');
  }
}
