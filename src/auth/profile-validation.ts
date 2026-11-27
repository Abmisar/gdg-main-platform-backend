import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';

export const ProfileName = () => applyDecorators(
  IsString({ message: 'fullName must be text.' }),
  Matches(/\S/, { message: 'fullName is required.' }),
  MaxLength(255, { message: 'fullName must be at most 255 characters.' }),
);

export const SaudiMobile = () => applyDecorators(IsString(), Matches(/^\+9665\d{8}$/));
