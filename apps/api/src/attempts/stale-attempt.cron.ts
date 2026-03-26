import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttemptsService } from './attempts.service';

@Injectable()
export class StaleAttemptCron {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleStaleAttempts() {
    await this.attemptsService.autoSubmitStaleAttempts();
  }
}
