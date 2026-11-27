import { ProfileName, SaudiMobile } from '../auth/profile-validation.js';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SubjectRequestDto {
  @IsIn(['objection', 'complaint', 'other']) kind: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/\S/) @MaxLength(2000) details?: string;
}

export class ManualRequestDto {
  @IsIn(['objection', 'complaint', 'email_access']) kind: string;
  @IsOptional() @IsInt() @Min(1) personId?: number;
  @IsOptional() @IsEmail() @MaxLength(255) contactEmail?: string;
  @IsOptional() @IsDateString() receivedAt?: string;
}

export class ResolveRequestDto {
  @IsIn(['IN_PROGRESS', 'RESOLVED']) status: string;
  @IsOptional() @IsString() @MaxLength(2000) resolution?: string;
}

export class CorrectProfileDto {
  @IsOptional() @ProfileName() fullName?: string;
  @IsOptional() @SaudiMobile() phoneNumber?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(255) major?: string;
}
