import { Module } from '@nestjs/common';
import { TranslationController } from './translation.controller';
import { TranslationTopicsController } from './translation-topics.controller';
import { TranslationService } from './translation.service';

@Module({
  controllers: [TranslationController, TranslationTopicsController],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}
