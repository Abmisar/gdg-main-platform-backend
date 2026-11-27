import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RegistrationReviewService } from './registration-review.service.js';

@Injectable()
export class ConfirmationExpiryJob {
  private readonly logger = new Logger(ConfirmationExpiryJob.name);
  private running = false;

  constructor(
    @Inject(RegistrationReviewService)
    private readonly reviewService: RegistrationReviewService,
  ) {}

  // Overlapping ticks in one process are skipped; overlapping runs across
  // processes are made safe by the service's event lock and status check.
  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'registration-confirmation-expiry',
  })
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const [offers, noShows] = await Promise.allSettled([
        this.reviewService.cancelOverdueConfirmationOffers(),
        this.reviewService.markOverdueNoShows(),
      ]);
      if (offers.status === 'rejected') throw offers.reason;
      if (noShows.status === 'rejected') throw noShows.reason;
      const { cancelled, promoted } = offers.value;
      const { marked } = noShows.value;
      if (cancelled > 0) {
        this.logger.log({
          event: 'registration_confirmation_offers_cancelled',
          cancelled,
          promoted: promoted.length,
        });
      }
      if (marked > 0) {
        this.logger.log({
          event: 'registration_no_shows_marked',
          marked,
        });
      }
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : undefined;
      this.logger.error({
        event: 'registration_expiry_job_failed',
        error: error instanceof Error ? error.name : 'UNKNOWN',
        ...(errorCode ? { errorCode } : {}),
      });
    } finally {
      this.running = false;
    }
  }
}
