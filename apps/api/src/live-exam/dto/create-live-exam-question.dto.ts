import { LiveExamQuestionType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Create/update a template question. Shape validation of `payload`
 * is type-dependent and happens in `validateQuestionPayload` at the
 * service layer — class-validator only enforces that `payload` is an
 * object here, so the discriminated union lives in one place.
 */
export class CreateLiveExamQuestionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsEnum(LiveExamQuestionType)
  type!: LiveExamQuestionType;

  @IsString()
  @MaxLength(2000)
  prompt!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  explanation?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  points?: number;
}
