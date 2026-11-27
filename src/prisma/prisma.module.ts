import { LeadershipAuditReader } from './leadership-audit-reader.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [ConfigModule],
  providers: [PrismaService, LeadershipAuditReader],
  exports: [PrismaService, LeadershipAuditReader],
})
export class PrismaModule {}
