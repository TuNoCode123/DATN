import { IsIn } from 'class-validator';

export class DeleteMessageDto {
  @IsIn(['self', 'everyone'])
  mode: 'self' | 'everyone';
}
