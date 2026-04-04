import {
  IsString,
  IsEnum,
  IsInt,
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

export class SyncQuestionDto {
  @IsOptional()
  @IsString()
  id?: string;

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

  @IsOptional()
  @IsString()
  imageLayout?: string;

  @IsOptional()
  metadata?: any;
}

export class SyncGroupDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsEnum(QuestionType)
  questionType: QuestionType;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsOptional()
  @IsString()
  passageId?: string;

  /** Temp ID referencing a new passage (no real id yet). Resolved server-side. */
  @IsOptional()
  @IsString()
  _tempPassageId?: string;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncQuestionDto)
  questions: SyncQuestionDto[];
}

export class SyncPassageDto {
  @IsOptional()
  @IsString()
  id?: string;

  /** Temp ID used by groups to reference this new passage before it has a real id */
  @IsOptional()
  @IsString()
  _tempId?: string;

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

  @IsInt()
  @Min(0)
  orderIndex: number;
}

export class SyncSectionDto {
  @IsOptional()
  @IsString()
  id?: string;

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
  @Type(() => SyncPassageDto)
  passages?: SyncPassageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncGroupDto)
  questionGroups: SyncGroupDto[];
}

export class SyncTestDto {
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
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncSectionDto)
  sections: SyncSectionDto[];
}
