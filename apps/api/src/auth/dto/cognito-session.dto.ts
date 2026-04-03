import { IsNotEmpty, IsString } from 'class-validator';

export class CognitoSessionDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  codeVerifier: string;

  @IsString()
  @IsNotEmpty()
  redirectUri: string;
}
