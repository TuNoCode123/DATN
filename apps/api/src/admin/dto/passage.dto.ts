import { IsString, IsOptional } from 'class-validator';

export class CreatePassageBodyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  contentHtml: string;
}

export class UpdatePassageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  contentHtml?: string;
}
