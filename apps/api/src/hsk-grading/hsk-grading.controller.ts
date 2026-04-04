import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { HskGradingService } from './hsk-grading.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('attempts')
@UseGuards(JwtAuthGuard)
export class HskGradingController {
  constructor(private hskGradingService: HskGradingService) {}

  @Get(':id/writing-evaluations')
  async getWritingEvaluations(@Param('id') attemptId: string) {
    return this.hskGradingService.getWritingEvaluations(attemptId);
  }
}
