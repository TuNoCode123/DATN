import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [CommentsController],
  providers: [CommentsService, ModerationService],
  exports: [CommentsService],
})
export class CommentsModule {}
