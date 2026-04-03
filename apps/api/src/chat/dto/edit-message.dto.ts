import { IsString, MinLength, MaxLength } from 'class-validator';

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;
}
