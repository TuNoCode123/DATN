import {
  IsString,
  IsEnum,
  IsInt,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ExamType,
  SectionSkill,
  QuestionType,
} from '@prisma/client';

export class CreateQuestionDto {
  @IsInt()
  @Min(1)
  questionNumber: number;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsOptional()
  @IsString()
  stem?: string;

  @IsOptional()
  options?: any; // JSON array: [{label: "A", text: "..."}, ...]

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

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  imageLayout?: string;

  @IsOptional()
  @IsString()
  imageSize?: string;

  @IsOptional()
  metadata?: any;
}

export class CreateQuestionGroupDto {
  @IsEnum(QuestionType)
  questionType: QuestionType;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  matchingOptions?: any; // JSON array

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imageSize?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}

export class CreatePassageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  contentHtml: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageLayout?: string;

  @IsOptional()
  @IsString()
  imageSize?: string;

  @IsOptional()
  @IsArray()
  images?: any[];

  @IsInt()
  @Min(0)
  orderIndex: number;
}

export class CreateSectionDto {
  @IsString()
  title: string;

  @IsEnum(SectionSkill)
  skill: SectionSkill;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMins?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePassageDto)
  passages?: CreatePassageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionGroupDto)
  questionGroups: CreateQuestionGroupDto[];
}

export class CreateTestDto {
  @IsString()
  title: string;

  @IsEnum(ExamType)
  examType: ExamType;

  @IsInt()
  @Min(1)
  durationMins: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSectionDto)
  sections: CreateSectionDto[];
}
