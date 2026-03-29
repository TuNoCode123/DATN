import { Module } from '@nestjs/common';
import { FlashcardsController } from './flashcards.controller';
import { FlashcardsService } from './flashcards.service';
import { SrsService } from './srs.service';
import { AiGeneratorService } from './ai-generator.service';

@Module({
  controllers: [FlashcardsController],
  providers: [FlashcardsService, SrsService, AiGeneratorService],
  exports: [FlashcardsService],
})
export class FlashcardsModule {}
