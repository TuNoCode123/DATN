import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { DeckVisibility } from '@prisma/client';

export class UpdateDeckDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DeckVisibility)
  visibility?: DeckVisibility;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
