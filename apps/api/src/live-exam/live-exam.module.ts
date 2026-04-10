import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { LiveExamService } from './live-exam.service';
import { LiveExamTemplateService } from './live-exam-template.service';
import { LiveExamController, AdminLiveExamController } from './live-exam.controller';
import { LiveExamScoringService } from './live-exam-scoring.service';
import { LiveExamLeaderboardService } from './live-exam-leaderboard.service';
import { LiveExamGateway } from './live-exam.gateway';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule],
  controllers: [LiveExamController, AdminLiveExamController],
  providers: [
    LiveExamService,
    LiveExamTemplateService,
    LiveExamScoringService,
    LiveExamLeaderboardService,
    LiveExamGateway,
  ],
  exports: [
    LiveExamService,
    LiveExamTemplateService,
    LiveExamScoringService,
    LiveExamLeaderboardService,
  ],
})
export class LiveExamModule {}
