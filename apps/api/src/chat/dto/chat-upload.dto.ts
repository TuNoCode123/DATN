import { IsString } from 'class-validator';

export class ChatUploadDto {
  @IsString()
  fileName: string;

  @IsString()
  contentType: string;
}
