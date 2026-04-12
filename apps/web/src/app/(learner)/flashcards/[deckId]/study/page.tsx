'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStartStudy, type Flashcard } from '@/features/flashcards/use-flashcard-queries';
import { ArrowLeft } from 'lucide-react';
import FlipCardTab from '@/components/flashcards/flip-card-tab';
import StudyWithAiTab from '@/components/flashcards/study-with-ai-tab';
import { LoadingLottie } from '@/components/feedback/loading-lottie';

export default function StudyModePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'ai' ? 'ai' : 'flip';
  const startStudy = useStartStudy();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);

  useEffect(() => {
    if (tab !== 'flip') return;
    startStudy.mutate(deckId, {
      onSuccess: (data) => {
        setSessionId(data.session.id);
        setCards(data.cards);
      },
    });
  }, [deckId, tab]); // eslint-disable-line

  if (tab === 'flip' && (startStudy.isPending || cards.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingLottie message="Shuffling your cards..." />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/flashcards/${deckId}`)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer text-sm"
        >
          <ArrowLeft size={16} /> Exit
        </button>
      </div>

      {tab === 'ai' ? (
        <StudyWithAiTab deckId={deckId} />
      ) : (
        sessionId && <FlipCardTab deckId={deckId} sessionId={sessionId} cards={cards} />
      )}
    </div>
  );
}
