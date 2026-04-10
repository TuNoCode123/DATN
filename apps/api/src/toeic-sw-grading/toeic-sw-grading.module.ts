import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScoringService } from '../scoring/scoring.service';
import { ToeicSwGradingService } from './toeic-sw-grading.service';
import { ToeicSwGradingController } from './toeic-sw-grading.controller';
import { SpeakingGateway } from './speaking.gateway';

@Module({
  imports: [AuthModule],
  controllers: [ToeicSwGradingController],
  providers: [
    ToeicSwGradingService,
    SpeakingGateway,
    ScoringService,
    {
      provide: 'ToeicSwGradingService',
      useExisting: ToeicSwGradingService,
    },
  ],
  exports: [ToeicSwGradingService, 'ToeicSwGradingService'],
})
export class ToeicSwGradingModule {}
