'use client';

import { AudioRecorder } from '@/components/ui/audio-recorder';
import type { SpeakingAssessment } from '@/lib/speaking/use-speaking-socket';

interface Question {
  id: string;
  questionNumber: number;
  stem: string | null;
  imageUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  question: Question;
  attemptId: string;
  onResult?: (questionId: string, assessment: SpeakingAssessment) => void;
}

export function DescribePictureRenderer({
  question,
  attemptId,
  onResult,
}: Props) {
  const meta = (question.metadata || {}) as Record<string, unknown>;
  const prepTime = (meta.prepTime as number) || 45;
  const responseTime = (meta.responseTime as number) || 45;

  return (
    <div>
      {/* Image to describe */}
      {question.imageUrl && (
        <div className="rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50 max-w-lg mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.imageUrl}
            alt={`Question ${question.questionNumber}`}
            className="w-full h-auto object-contain"
          />
        </div>
      )}

      {/* Instructions */}
      {question.stem && (
        <p className="text-sm text-slate-600 mb-3">{question.stem}</p>
      )}

      <AudioRecorder
        questionId={question.id}
        attemptId={attemptId}
        questionType="DESCRIBE_PICTURE"
        questionStem={question.stem || ''}
        prepTime={prepTime}
        responseTime={responseTime}
        onResult={(assessment) => onResult?.(question.id, assessment)}
      />
    </div>
  );
}
