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

export function ReadAloudRenderer({ question, attemptId, onResult }: Props) {
  const meta = (question.metadata || {}) as Record<string, unknown>;
  const prepTime = (meta.prepTime as number) || 45;
  const responseTime = (meta.responseTime as number) || 45;

  return (
    <div>
      {/* Text passage to read */}
      {question.stem && (
        <div className="brutal-card p-5 mb-4 bg-white">
          <p className="text-base leading-relaxed text-slate-800 font-serif">
            {question.stem}
          </p>
        </div>
      )}

      <AudioRecorder
        questionId={question.id}
        attemptId={attemptId}
        targetText={question.stem || ''}
        questionType="READ_ALOUD"
        questionStem={question.stem || ''}
        prepTime={prepTime}
        responseTime={responseTime}
        onResult={(assessment) => onResult?.(question.id, assessment)}
      />
    </div>
  );
}
