import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ReportCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
