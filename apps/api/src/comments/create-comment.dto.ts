import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Transform(({ value }) => value?.trim())
  body: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
