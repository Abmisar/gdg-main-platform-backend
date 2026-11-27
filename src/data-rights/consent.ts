import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { clientIp } from '../common/http/client-ip.js';

export const documentVersions = { privacy: '2', terms: '2' } as const;

export class DocumentConsentDto {
  @IsString() privacy: string;
  @IsString() terms: string;
  @IsIn(['ar', 'en']) locale: string;
}

export class ConsentSubmission {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => DocumentConsentDto)
  consent: DocumentConsentDto;
}

export function captureConsent(
  input: DocumentConsentDto,
  request: Request,
  purposes: string[],
  ageConfirmed = false,
) {
  if (
    input?.privacy !== documentVersions.privacy ||
    input.terms !== documentVersions.terms ||
    !['ar', 'en'].includes(input.locale)
  ) {
    throw new BadRequestException(
      'Accept the current privacy notice and terms.',
    );
  }
  const hash = (kind: string, value: string) =>
    createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
      .update(`consent/${kind}/${value}`)
      .digest('hex');
  const acceptedAt = new Date().toISOString();
  const ipHash = hash('ip', clientIp(request));
  const userAgentHash = hash('user-agent', request.headers['user-agent'] ?? '');
  const rows = purposes.flatMap((purpose) =>
    Object.entries(documentVersions).map(([document, version]) => ({
      document,
      version,
      purpose,
      locale: input.locale,
      acceptedAt,
      ipHash,
      userAgentHash,
    })),
  );
  if (ageConfirmed) rows.push({ document: 'terms', version: documentVersions.terms, purpose: 'age_18_or_older', locale: input.locale, acceptedAt, ipHash, userAgentHash });
  return rows;
}

export type ConsentEvidence = ReturnType<typeof captureConsent>;
