import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsArray,
  Min,
} from 'class-validator';
import { SectionSkill } from '@prisma/client';

export class CreateSectionBodyDto {
  @IsString()
  title: string;

  @IsEnum(SectionSkill)
  skill: SectionSkill;

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
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(SectionSkill)
  skill?: SectionSkill;

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
}

export class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  order: string[];
}
