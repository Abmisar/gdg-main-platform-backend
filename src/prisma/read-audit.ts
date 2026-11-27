import {
  Inject,
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, concatMap, defer } from 'rxjs';
import { PrismaService } from './prisma.service.js';

type CountFrom =
  'items' | 'members' | 'array' | 'leaders' | 'targets' | 'single';
const auditMetadata = Symbol('staffRead');
export function AuditRead(action: string, countFrom: CountFrom) {
  return SetMetadata(auditMetadata, { action, countFrom });
}

@Injectable()
export class ReadAuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const meta = this.reflector.get<{ action: string; countFrom: CountFrom }>(
      auditMetadata,
      context.getHandler(),
    );
    if (!meta) return next.handle();
    const request = context.switchToHttp().getRequest();
    const requestedScope =
      request.params.requestId ??
      request.params.eventId ??
      request.params.committeeCode ??
      (meta.action === 'applications.committee'
        ? request.query.committeeCode
        : meta.action === 'applications.leadership'
          ? request.query.scope
          : null) ??
      null;
    const scope =
      typeof requestedScope === 'string' &&
      /^[A-Z0-9_-]{1,32}$/i.test(requestedScope)
        ? requestedScope
        : null;
    const record = (status: 'DISCLOSED' | 'FAILED', count: number) =>
      this.db.staffReadAudit.createMany({
        data: {
          actorMemberId: request.user.memberId,
          action: meta.action,
          scope,
          status,
          count,
        },
      });
    return defer(() => next.handle()).pipe(
      catchError(async (error) => {
        if (request.user?.memberId) await record('FAILED', 0);
        throw error;
      }),
      concatMap(async (response) => {
        const data = response.data;
        const count =
          meta.countFrom === 'single'
            ? 1
            : meta.countFrom === 'array'
              ? data.length
              : meta.countFrom === 'leaders'
                ? data.committees.reduce(
                    (sum: number, committee: { leaders: unknown[] }) =>
                      sum + committee.leaders.length,
                    0,
                  )
                : data[meta.countFrom].length;
        await record('DISCLOSED', count);
        return response;
      }),
    );
  }
}
