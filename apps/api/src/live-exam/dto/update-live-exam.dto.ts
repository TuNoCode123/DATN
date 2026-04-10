import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Partial update for a live exam TEMPLATE. Only valid while the
 * template is still in DRAFT status.
 */
export class UpdateLiveExamTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(60 * 60 * 2)
  durationSec?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  perQuestionSec?: number;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(10)
  interstitialSec?: number;
}
