import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_BYTES + 16 * 1024;
export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@Injectable()
export class ImageUploadLengthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<Request>();
    const length = headers['content-length'];
    if (!length || !/^\d+$/.test(length) || headers['transfer-encoding']) {
      throw new HttpException('Image uploads require Content-Length.', HttpStatus.LENGTH_REQUIRED);
    }
    if (Number(length) > MAX_IMAGE_REQUEST_BYTES) {
      throw new PayloadTooLargeException('The image upload is too large.');
    }
    return true;
  }
}

export const ImageUploadInterceptor = FileInterceptor('file', {
  limits: {
    files: 1,
    fields: 0,
    parts: 2,
    fieldNameSize: 4,
    fieldSize: 0,
    fileSize: MAX_IMAGE_BYTES + 1,
  },
  fileFilter: (_request, file, callback) => callback(null, IMAGE_TYPES.has(file.mimetype)),
});
