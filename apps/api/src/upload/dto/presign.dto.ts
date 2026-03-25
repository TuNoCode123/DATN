import { IsString, IsNotEmpty } from 'class-validator';

export class PresignRequestDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;
}
