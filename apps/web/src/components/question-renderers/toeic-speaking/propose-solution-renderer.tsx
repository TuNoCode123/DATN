'use client';

import { AudioRecorder } from '@/components/ui/audio-recorder';
import { RichContent } from '@/components/rich-content';
import type { SpeakingAssessment } from '@/lib/speaking/use-speaking-socket';

interface Question {
  id: string;
  questionNumber: number;
  stem: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  groupInstructions: string | null;
  questions: Question[];
  attemptId: string;
  onResult?: (questionId: string, assessment: SpeakingAssessment) => void;
}

export function ProposeSolutionRenderer({
  groupInstructions,
  questions,
  attemptId,
  onResult,
}: Props) {
  return (
    <div>
      {/* Document/table/schedule */}
      {groupInstructions && (
        <div className="brutal-card p-4 mb-4 bg-white">
          <RichContent
            html={groupInstructions}
            className="text-sm leading-relaxed"
          />
        </div>
      )}

      {questions.map((question) => {
        const meta = (question.metadata || {}) as Record<string, unknown>;
        const prepTime = (meta.prepTime as number) || 45;
        const responseTime = (meta.responseTime as number) || 60;

        return (
          <div key={question.id} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-500 text-white font-bold text-xs">
                {question.questionNumber}
              </span>
              {question.stem && (
                <p className="text-sm font-medium text-slate-800">
                  {question.stem}
                </p>
              )}
            </div>
            <AudioRecorder
              questionId={question.id}
              attemptId={attemptId}
              questionType="PROPOSE_SOLUTION"
              questionStem={question.stem || ''}
              prepTime={prepTime}
              responseTime={responseTime}
              onResult={(assessment) => onResult?.(question.id, assessment)}
            />
          </div>
        );
      })}
    </div>
  );
}
