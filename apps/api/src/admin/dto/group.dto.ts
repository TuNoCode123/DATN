import { IsString, IsEnum, IsOptional } from 'class-validator';
import { QuestionType } from '@prisma/client';

export class CreateGroupBodyDto {
  @IsEnum(QuestionType)
  questionType: QuestionType;

  @IsOptional()
  @IsString()
  passageId?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  matchingOptions?: any;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsEnum(QuestionType)
  questionType?: QuestionType;

  @IsOptional()
  @IsString()
  passageId?: string | null;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  matchingOptions?: any;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
