import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class LeadershipAuditReader implements OnModuleDestroy {
  private client?: PrismaClient;

  recent() {
    const url = process.env.AUDIT_READER_DATABASE_URL;
    if (!url) throw new Error('Missing audit reader connection');
    this.client ??= new PrismaClient({
      adapter: new PrismaPg({ connectionString: url, max: 1 }),
    });
    return this.client
      .$queryRaw`SELECT id, "actorMemberId", action, scope, status, count, "readAt" FROM public.recent_staff_reads ORDER BY id DESC`;
  }

  async onModuleDestroy() {
    await this.client?.$disconnect();
  }
}
