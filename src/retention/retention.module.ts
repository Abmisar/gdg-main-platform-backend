import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventRetentionService } from './event-retention.service.js';
import { RetentionService } from './retention.service.js';

@Module({ imports: [PrismaModule], providers: [RetentionService, EventRetentionService] })
export class RetentionModule {}
