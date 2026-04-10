import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ToeicSwGradingService } from './toeic-sw-grading.service';

@Controller('toeic-sw-grading')
@UseGuards(JwtAuthGuard)
export class ToeicSwGradingController {
  constructor(private service: ToeicSwGradingService) {}

  @Get('evaluations/:attemptId')
  getWritingEvaluations(@Param('attemptId') attemptId: string) {
    return this.service.getWritingEvaluations(attemptId);
  }
}
