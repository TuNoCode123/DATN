import { IsString, IsOptional } from 'class-validator';

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
  imageLayout?: string;
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
  imageLayout?: string;
}
