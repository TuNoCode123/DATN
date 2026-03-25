import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuestionBodyDto {
  @IsOptional()
  @IsString()
  stem?: string;

  @IsOptional()
  options?: any;

  @IsString()
  correctAnswer: string;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;
}

export class BulkCreateQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionBodyDto)
  questions: CreateQuestionBodyDto[];
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  stem?: string;

  @IsOptional()
  options?: any;

  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;
}

export class BulkDeleteDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
