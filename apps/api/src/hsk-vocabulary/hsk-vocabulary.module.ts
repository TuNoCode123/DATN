import { Module } from '@nestjs/common';
import { HskVocabularyService } from './hsk-vocabulary.service';
import {
  HskVocabularyPublicController,
  HskVocabularyAdminController,
} from './hsk-vocabulary.controller';

@Module({
  controllers: [HskVocabularyPublicController, HskVocabularyAdminController],
  providers: [HskVocabularyService],
  exports: [HskVocabularyService],
})
export class HskVocabularyModule {}
