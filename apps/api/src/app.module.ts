import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TestsModule } from './tests/tests.module';
import { AttemptsModule } from './attempts/attempts.module';
import { TagsModule } from './tags/tags.module';
import { CommentsModule } from './comments/comments.module';
import { AdminModule } from './admin/admin.module';
import { UploadModule } from './upload/upload.module';
import { ChatModule } from './chat/chat.module';
import { FlashcardsModule } from './flashcards/flashcards.module';
import { HealthModule } from './health/health.module';
import { BedrockModule } from './bedrock/bedrock.module';
import { HskGradingModule } from './hsk-grading/hsk-grading.module';
import { HskVocabularyModule } from './hsk-vocabulary/hsk-vocabulary.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    RedisModule,
    BedrockModule,
    AuthModule,
    UsersModule,
    TestsModule,
    AttemptsModule,
    TagsModule,
    CommentsModule,
    AdminModule,
    UploadModule,
    ChatModule,
    FlashcardsModule,
    HskGradingModule,
    HskVocabularyModule,
  ],
})
export class AppModule {}
