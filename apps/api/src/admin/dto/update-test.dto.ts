import {
  IsString,
  IsEnum,
  IsInt,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
} from 'class-validator';
import { ExamType } from '@prisma/client';

export class UpdateTestMetadataDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(ExamType)
  examType?: ExamType;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMins?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
