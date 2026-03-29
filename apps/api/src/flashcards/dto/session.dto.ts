import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { FlashcardQuestionType } from '@prisma/client';

export class StartPracticeDto {
  @IsOptional()
  @IsArray()
  @IsEnum(FlashcardQuestionType, { each: true })
  questionTypes?: FlashcardQuestionType[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  questionCount?: number;
}

export class StartTestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  questionCount?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(FlashcardQuestionType, { each: true })
  questionTypes?: FlashcardQuestionType[];
}

export class FlipResultDto {
  @IsString()
  flashcardId: string;

  @IsBoolean()
  known: boolean;
}

export class SubmitAnswerDto {
  @IsString()
  flashcardId: string;

  @IsString()
  userAnswer: string;
}

export class SubmitTestDto {
  @IsArray()
  answers: SubmitTestAnswerItem[];
}

export class SubmitTestAnswerItem {
  @IsString()
  answerId: string;

  @IsString()
  userAnswer: string;
}

export class RateCardDto {
  @IsString()
  flashcardId: string;

  @IsInt()
  @Min(0)
  @Max(5)
  quality: number;
}
