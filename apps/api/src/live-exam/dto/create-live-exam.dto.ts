import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Create/update a live exam TEMPLATE. This replaces the pre-refactor
 * `CreateLiveExamDto` — hosts now author a template once and spawn
 * sessions from it, rather than creating a one-shot live exam.
 */
export class CreateLiveExamTemplateDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(30)
  @Max(60 * 60 * 2)
  durationSec!: number;

  @IsInt()
  @Min(5)
  @Max(300)
  perQuestionSec!: number;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(10)
  interstitialSec?: number;
}
