import { IsString, IsOptional, IsArray, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddCardsDto {
  @IsArray()
  @Type(() => AddCardItemDto)
  cards: AddCardItemDto[];
}

export class AddCardItemDto {
  @IsString()
  word: string;

  @IsString()
  meaning: string;

  @IsOptional()
  @IsString()
  exampleSentence?: string;

  @IsOptional()
  @IsString()
  ipa?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateCardDto {
  @IsOptional()
  @IsString()
  word?: string;

  @IsOptional()
  @IsString()
  meaning?: string;

  @IsOptional()
  @IsString()
  exampleSentence?: string;

  @IsOptional()
  @IsString()
  ipa?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class ReorderCardsDto {
  @IsArray()
  @IsString({ each: true })
  cardIds: string[];
}
