import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListBlogPostsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'SCHEDULED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED';

  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  limit?: number;
}
