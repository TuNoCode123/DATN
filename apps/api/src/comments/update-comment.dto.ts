import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Transform(({ value }) => value?.trim())
  body: string;
}
