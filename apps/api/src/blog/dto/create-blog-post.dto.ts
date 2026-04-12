import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBlogPostDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsString()
  @MaxLength(500)
  excerpt!: string;

  @IsString()
  contentHtml!: string;

  @IsOptional()
  @IsObject()
  contentJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
