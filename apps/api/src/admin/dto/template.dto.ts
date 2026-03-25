import { IsEnum, IsOptional } from 'class-validator';
import { ExamType, SectionSkill } from '@prisma/client';

export class CreateFromTemplateDto {
  @IsEnum(ExamType)
  examType: ExamType;

  @IsOptional()
  @IsEnum(SectionSkill)
  skill?: SectionSkill; // Required for IELTS (LISTENING or READING)
}
