'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDeck, useDeleteDeck, useCloneDeck } from '@/features/flashcards/use-flashcard-queries';
import { useAuthStore } from '@/lib/auth-store';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Edit,
  Copy,
  Trash2,
  Play,
  Globe,
  Lock,
  Volume2,
  Sparkles,
} from 'lucide-react';

export default function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: deck, isLoading } = useDeck(deckId);
  const deleteDeck = useDeleteDeck();
  const cloneDeck = useCloneDeck();

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-muted rounded-xl animate-pulse mb-4" />
        <div className="h-44 bg-white rounded-2xl border-[2.5px] border-gray-200 animate-pulse mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl border-[2.5px] border-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!deck) return null;
  const isOwner = deck.userId === user?.id;
  const cards = deck.cards || [];

  const handleDelete = async () => {
    if (!confirm('Delete this deck and all its cards?')) return;
    await deleteDeck.mutateAsync(deckId);
    router.push('/flashcards');
  };

  const handleClone = async () => {
    const cloned = await cloneDeck.mutateAsync(deckId);
    router.push(`/flashcards/${cloned.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={() => router.push('/flashcards')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-medium transition-colors cursor-pointer text-sm">
        <ArrowLeft size={16} /> Back to Decks
      </button>

      {/* Deck header */}
      <div className="brutal-card p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded-lg border-2 border-border-strong flex items-center justify-center ${deck.visibility === 'PUBLIC' ? 'bg-cyan-100' : 'bg-muted'}`}>
                {deck.visibility === 'PUBLIC' ? <Globe size={11} className="text-cyan-600" /> : <Lock size={11} className="text-muted-foreground" />}
              </div>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{deck.visibility}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1 font-heading">{deck.title}</h1>
            {deck.description && <p className="text-muted-foreground mb-3 text-sm">{deck.description}</p>}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 font-medium"><BookOpen size={14} /> {cards.length} cards</span>
              {deck.user && <span>by <strong className="text-foreground">{deck.user.displayName || 'Anonymous'}</strong></span>}
            </div>
            {deck.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {deck.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-bold">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <button onClick={() => router.push(`/flashcards/${deckId}/edit`)} className="w-9 h-9 rounded-xl border-2 border-border-strong bg-white flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-[2px_2px_0px_var(--shadow-brutal)]">
                <Edit size={15} />
              </button>
            )}
            <button onClick={handleClone} className="w-9 h-9 rounded-xl border-2 border-border-strong bg-white flex items-center justify-center text-muted-foreground hover:text-cyan-600 transition-colors cursor-pointer shadow-[2px_2px_0px_var(--shadow-brutal)]" title="Clone">
              <Copy size={15} />
            </button>
            {isOwner && (
              <button onClick={handleDelete} className="w-9 h-9 rounded-xl border-2 border-border-strong bg-white flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors cursor-pointer shadow-[2px_2px_0px_var(--shadow-brutal)]">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mode Buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        <ModeButton icon={<Play size={20} />} label="Flip Cards" desc="Classic study" iconBg="bg-emerald-100" iconColor="text-emerald-600" onClick={() => router.push(`/flashcards/${deckId}/study?tab=flip`)} />
        <ModeButton icon={<Sparkles size={20} />} label="Study with AI" desc="Mixed AI practice" iconBg="bg-gradient-to-br from-indigo-100 to-violet-100" iconColor="text-indigo-600" onClick={() => router.push(`/flashcards/${deckId}/study?tab=ai`)} />
        <ModeButton icon={<Brain size={20} />} label="Review" desc="Spaced repetition" iconBg="bg-violet-100" iconColor="text-violet-600" onClick={() => router.push(`/flashcards/review?deckId=${deckId}`)} />
      </div>

      {/* Card List */}
      <h2 className="text-lg font-bold text-foreground mb-4 font-heading">Cards ({cards.length})</h2>
      <div className="space-y-2.5">
        {cards.map((card, i) => {
          const progress = deck.progress?.find((p) => p.flashcardId === card.id);
          return (
            <div key={card.id} className="brutal-card p-4 !shadow-[3px_3px_0px_var(--shadow-brutal)]">
              <div className="flex items-start justify-between">
                <div className="flex-1 flex items-start gap-3">
                  <span className="text-xs font-bold text-muted-foreground bg-muted border-2 border-border-strong rounded-lg w-7 h-7 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{card.word}</span>
                      {card.ipa && <span className="text-xs text-muted-foreground">{card.ipa}</span>}
                      {card.audioUrl && <Volume2 size={13} className="text-muted-foreground cursor-pointer hover:text-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{card.meaning}</p>
                    {card.exampleSentence && <p className="text-xs text-muted-foreground/60 mt-1 italic">&ldquo;{card.exampleSentence}&rdquo;</p>}
                  </div>
                </div>
                {progress && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    progress.interval >= 21 ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    : progress.repetitions >= 1 ? 'bg-amber-50 text-amber-600 border-amber-200'
                    : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {progress.interval >= 21 ? 'Mastered' : progress.repetitions >= 1 ? 'Learning' : 'New'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModeButton({ icon, label, desc, iconBg, iconColor, onClick }: {
  icon: React.ReactNode; label: string; desc: string; iconBg: string; iconColor: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="brutal-card flex flex-col items-center gap-2 p-4 cursor-pointer hover:!shadow-[6px_6px_0px_var(--shadow-brutal)]">
      <div className={`w-10 h-10 rounded-xl border-2 border-border-strong flex items-center justify-center ${iconBg} ${iconColor}`}>{icon}</div>
      <span className="font-bold text-sm text-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground">{desc}</span>
    </button>
  );
}
