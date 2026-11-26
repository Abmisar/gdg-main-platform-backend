import { BadGatewayException, BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../common/http/image-upload.js';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function matchesImageSignature(buffer: Buffer, mimetype: string) {
  switch (mimetype) {
    case 'image/jpeg':
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'image/gif':
      return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
    default:
      return false;
  }
}

@Injectable()
export class CommitteeEventImageStorageService {
  private readonly logger = new Logger(CommitteeEventImageStorageService.name);
  private client?: SupabaseClient;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async upload(file: { buffer: Buffer; mimetype: string; size: number }) {
    return this.uploadToPath(file);
  }

  async uploadAnnouncementImage(file: { buffer: Buffer; mimetype: string; size: number }) {
    return this.uploadToPath(file, 'announcements');
  }

  private async uploadToPath(file: { buffer: Buffer; mimetype: string; size: number }, folder?: string) {
    if (
      !IMAGE_TYPES.has(file.mimetype)
      || file.size <= 0
      || file.size > MAX_IMAGE_BYTES
      || file.buffer.length !== file.size
      || !matchesImageSignature(file.buffer, file.mimetype)
    ) {
      throw new BadRequestException('Choose a JPEG, PNG, WebP, or GIF image up to 5 MB.');
    }
    const bucketId = this.config.get<string>('SUPABASE_ASSET_BUCKET') ?? 'event-images';
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucketId)) {
      throw new BadGatewayException('Event image storage is unavailable.');
    }
    const client = this.getClient();
    const { data: bucket, error: bucketError } = await client.storage.getBucket(bucketId);
    const allowedTypes = bucket?.allowed_mime_types;
    if (
      bucketError || bucket?.id !== bucketId || bucket.name !== bucketId || bucket.public !== true
      || bucket.file_size_limit !== MAX_IMAGE_BYTES
      || !Array.isArray(allowedTypes)
      || allowedTypes.length !== IMAGE_TYPES.size
      || ![...IMAGE_TYPES].every((type) => allowedTypes.includes(type))
    ) {
      this.logger.error({ event: 'event_image_storage_failed', operation: 'check_bucket' });
      throw new BadGatewayException('Event image storage is unavailable.');
    }
    const objectName = `${randomUUID()}.${EXTENSION_BY_TYPE[file.mimetype]}`;
    const objectPath = folder ? `${folder}/${objectName}` : objectName;
    const { error } = await client.storage.from(bucketId).upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) {
      this.logger.error({ event: 'event_image_storage_failed', operation: 'upload' });
      throw new BadGatewayException('The event image could not be stored.');
    }
    return { imageUrl: client.storage.from(bucketId).getPublicUrl(objectPath).data.publicUrl };
  }

  private getClient() {
    if (this.client) return this.client;
    try {
      const key = this.config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');
      const token = this.config.getOrThrow<string>('SUPABASE_ASSET_UPLOAD_TOKEN');
      const { role, exp } = decodeJwt(token);
      if (
        !key.startsWith('sb_publishable_') || role !== 'gdg_asset_uploader'
        || typeof exp !== 'number' || !Number.isFinite(exp) || exp <= Date.now() / 1000
      ) {
        throw new Error('Invalid asset storage credential');
      }
      const url = new URL(this.config.getOrThrow<string>('SUPABASE_URL'));
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        throw new Error('Production asset storage requires HTTPS');
      }
      this.client = createClient(url.href, key, {
        accessToken: async () => token,
      });
      return this.client;
    } catch {
      throw new BadGatewayException('Event image storage is unavailable.');
    }
  }
}
