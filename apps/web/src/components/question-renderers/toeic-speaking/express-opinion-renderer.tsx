'use client';

import { AudioRecorder } from '@/components/ui/audio-recorder';
import type { SpeakingAssessment } from '@/lib/speaking/use-speaking-socket';

interface Question {
  id: string;
  questionNumber: number;
  stem: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  question: Question;
  attemptId: string;
  onResult?: (questionId: string, assessment: SpeakingAssessment) => void;
}

export function ExpressOpinionRenderer({
  question,
  attemptId,
  onResult,
}: Props) {
  const meta = (question.metadata || {}) as Record<string, unknown>;
  const prepTime = (meta.prepTime as number) || 30;
  const responseTime = (meta.responseTime as number) || 60;

  return (
    <div>
      {/* Opinion statement/prompt */}
      {question.stem && (
        <div className="brutal-card p-5 mb-4 bg-amber-50 border-amber-200">
          <p className="text-base leading-relaxed text-slate-800 font-medium">
            {question.stem}
          </p>
        </div>
      )}

      <AudioRecorder
        questionId={question.id}
        attemptId={attemptId}
        questionType="EXPRESS_OPINION"
        questionStem={question.stem || ''}
        prepTime={prepTime}
        responseTime={responseTime}
        onResult={(assessment) => onResult?.(question.id, assessment)}
      />
    </div>
  );
}
