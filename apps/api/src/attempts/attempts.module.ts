import { Module } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { ScoringModule } from '../scoring/scoring.module';
import { StaleAttemptCron } from './stale-attempt.cron';

@Module({
  imports: [ScoringModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, StaleAttemptCron],
  exports: [AttemptsService],
})
export class AttemptsModule {}
