import { createHash } from 'node:crypto';
import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitteeEventImageStorageService } from './committee-event-image-storage.service.js';

const storage = vi.hoisted(() => ({
  getBucket: vi.fn(),
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage }),
}));

const image = { buffer: Buffer.from('GIF89a'), mimetype: 'image/gif', size: 6 };
const bucket = {
  name: 'event-images',
  id: 'event-images',
  public: true,
  file_size_limit: 5 * 1024 * 1024,
  allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
};
function service(overrides = {}) {
  const payload = Buffer.from(JSON.stringify({ role: 'gdg_asset_uploader', exp: 4102444800 })).toString('base64url');
  return new CommitteeEventImageStorageService(new ConfigService({
    SUPABASE_URL: 'https://storage.example.test',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    SUPABASE_ASSET_UPLOAD_TOKEN: `e30.${payload}.fixture`,
    ...overrides,
  }));
}

describe('committee and announcement asset storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getBucket.mockResolvedValue({ data: bucket, error: null });
    storage.from.mockReturnValue(storage);
    storage.upload.mockResolvedValue({ error: null });
    storage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://images.example.test/file.gif' } });
  });

  it('binds the validated media type and exact image bytes to the OCI signature', async () => {
    const fetch = vi.fn(async (request: Request) => {
      const headers = request.headers;
      expect(headers.get('content-type')).toBe(image.mimetype);
      expect(headers.get('x-amz-content-sha256')).toBe(createHash('sha256').update(image.buffer).digest('hex'));
      const signed = headers.get('authorization')?.match(/SignedHeaders=([^,]+)/)?.[1].split(';');
      expect(signed).toEqual(expect.arrayContaining(['content-type', 'x-amz-content-sha256']));
      expect(Buffer.from(await request.arrayBuffer())).toEqual(image.buffer);
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    try {
      await service({
        ASSET_S3_ENDPOINT: 'https://storage.example.test', ASSET_BUCKET: 'artwork',
        ASSET_S3_KEY: 'fixture', ASSET_S3_SECRET: 'fixture', ASSET_PUBLIC_BASE: 'https://images.example.test',
      }).upload(image);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads bucket metadata on every upload and preserves event and announcement paths', async () => {
    const images = service();
    await images.upload(image);
    await images.uploadAnnouncementImage(image);
    expect(storage.getBucket).toHaveBeenCalledTimes(2);
    expect(storage.from).toHaveBeenCalledWith('event-images');
    expect(storage.upload.mock.calls[0][0]).toMatch(/^[0-9a-f-]+\.gif$/);
    expect(storage.upload.mock.calls[1][0]).toMatch(/^announcements\/[0-9a-f-]+\.gif$/);
    expect(storage.upload.mock.calls[1][2].upsert).toBe(false);
  });

  it.each([
    { public: false },
    { file_size_limit: null },
    { allowed_mime_types: ['image/*'] },
    { id: 'other' },
  ])('stops before writing when stored settings differ (%j)', async (change) => {
    storage.getBucket.mockResolvedValue({ data: { ...bucket, ...change }, error: null });
    await expect(service().upload(image)).rejects.toBeInstanceOf(BadGatewayException);
    expect(storage.from).not.toHaveBeenCalled();
  });

  it('can target a separately provisioned public bucket', async () => {
    const id = 'public-assets';
    storage.getBucket.mockResolvedValue({ data: { ...bucket, id, name: id }, error: null });
    await service({ SUPABASE_ASSET_BUCKET: id }).upload(image);
    expect(storage.getBucket).toHaveBeenCalledWith(id);
    expect(storage.from).toHaveBeenCalledWith(id);
  });

  it('requires the scoped credential before contacting storage', async () => {
    await expect(service({ SUPABASE_ASSET_UPLOAD_TOKEN: '' }).upload(image)).rejects.toBeInstanceOf(BadGatewayException);
    expect(storage.getBucket).not.toHaveBeenCalled();
  });
  it('requires HTTPS for production asset storage', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await expect(service({ SUPABASE_URL: 'http://storage.example.test' }).upload(image))
        .rejects.toBeInstanceOf(BadGatewayException);
      expect(storage.getBucket).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

});
