import { IsInt, Min } from 'class-validator';

export class MarkReadDto {
  @IsInt()
  @Min(0)
  seqNumber: number;
}
