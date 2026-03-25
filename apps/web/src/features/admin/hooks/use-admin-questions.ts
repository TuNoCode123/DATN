import { useQuery } from '@tanstack/react-query';
import { adminQuestionsApi } from '@/lib/admin-api';
import type { SectionSkill, QuestionType, ExamType } from '../types';

interface QuestionFilters {
  search?: string;
  skill?: string;
  questionType?: string;
  examType?: string;
}

export function useAdminQuestions(filters?: QuestionFilters) {
  return useQuery({
    queryKey: ['admin-questions', filters],
    queryFn: () =>
      adminQuestionsApi.getAll({
        search: filters?.search,
        skill: filters?.skill as SectionSkill | undefined,
        questionType: filters?.questionType as QuestionType | undefined,
        examType: filters?.examType as ExamType | undefined,
      }),
  });
}
