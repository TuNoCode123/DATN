import { Module } from '@nestjs/common';
import { PronunciationController } from './pronunciation.controller';
import { PronunciationService } from './pronunciation.service';
import { PronunciationGateway } from './pronunciation.gateway';
import { PronunciationTopicsController } from './pronunciation-topics.controller';
import { TtsService } from './tts.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PronunciationController, PronunciationTopicsController],
  providers: [PronunciationService, PronunciationGateway, TtsService],
  exports: [PronunciationService],
})
export class PronunciationModule {}
