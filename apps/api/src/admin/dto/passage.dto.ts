import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PassageImageDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  layout?: string;

  @IsOptional()
  @IsString()
  size?: string;
}

export class CreatePassageBodyDto {
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
  transcript?: string;

  @IsOptional()
  @IsString()
  imageLayout?: string;

  @IsOptional()
  @IsString()
  imageSize?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassageImageDto)
  images?: PassageImageDto[];
}

export class UpdatePassageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  contentHtml?: string;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassageImageDto)
  images?: PassageImageDto[];
}
