import { IsString, MinLength, MaxLength } from 'class-validator';

export class ReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  emoji: string;
}
