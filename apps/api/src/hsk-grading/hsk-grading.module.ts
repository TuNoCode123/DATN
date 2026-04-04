import { Module } from '@nestjs/common';
import { HskGradingService } from './hsk-grading.service';
import { HskGradingController } from './hsk-grading.controller';

@Module({
  controllers: [HskGradingController],
  providers: [HskGradingService],
  exports: [HskGradingService],
})
export class HskGradingModule {}
