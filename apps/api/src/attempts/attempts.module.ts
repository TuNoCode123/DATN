import { Module } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { ScoringModule } from '../scoring/scoring.module';
import { HskGradingModule } from '../hsk-grading/hsk-grading.module';
import { UploadModule } from '../upload/upload.module';
import { ToeicSwGradingModule } from '../toeic-sw-grading/toeic-sw-grading.module';
import { StaleAttemptCron } from './stale-attempt.cron';

@Module({
  imports: [ScoringModule, HskGradingModule, UploadModule, ToeicSwGradingModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, StaleAttemptCron],
  exports: [AttemptsService],
})
export class AttemptsModule {}
