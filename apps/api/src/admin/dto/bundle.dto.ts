import { IsString, IsOptional, IsArray, IsEnum, IsBoolean, IsInt } from 'class-validator';
import { ExamType } from '@prisma/client';

export class CreateBundleDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ExamType)
  examType: ExamType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testIds?: string[];

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class UpdateBundleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ExamType)
  examType?: ExamType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testIds?: string[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}
