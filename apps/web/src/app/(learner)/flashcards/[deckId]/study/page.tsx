'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStartStudy, type Flashcard } from '@/features/flashcards/use-flashcard-queries';
import { ArrowLeft } from 'lucide-react';
import FlipCardTab from '@/components/flashcards/flip-card-tab';

export default function StudyModePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const startStudy = useStartStudy();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);

  useEffect(() => {
    startStudy.mutate(deckId, {
      onSuccess: (data) => {
        setSessionId(data.session.id);
        setCards(data.cards);
      },
    });
  }, [deckId]); // eslint-disable-line

  if (startStudy.isPending || cards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
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

      {sessionId && (
        <FlipCardTab deckId={deckId} sessionId={sessionId} cards={cards} />
      )}
    </div>
  );
}
