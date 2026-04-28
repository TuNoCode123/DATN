import { IsEnum, IsNumber, IsDateString } from 'class-validator';
import { ExamType } from '@prisma/client';

export class UpsertGoalDto {
  @IsEnum(ExamType)
  examType!: ExamType;

  @IsNumber()
  targetScore!: number;

  @IsDateString()
  targetDate!: string;
}
