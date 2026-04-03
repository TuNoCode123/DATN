import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttemptsService } from './attempts.service';

@Injectable()
export class StaleAttemptCron {
  private readonly logger = new Logger(StaleAttemptCron.name);

  constructor(private readonly attemptsService: AttemptsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleStaleAttempts() {
    try {
      await this.attemptsService.autoSubmitStaleAttempts();
    } catch (error) {
      this.logger.error('Failed to auto-submit stale attempts', error?.stack || error);
    }
  }
}
