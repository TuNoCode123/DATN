'use client';

import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  useDeck,
  useDeleteDeck,
  useCloneDeck,
} from '@/features/flashcards/use-flashcard-queries';
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
  TrendingUp,
} from 'lucide-react';

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
};

export default function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: deck, isLoading } = useDeck(deckId);
  const deleteDeck = useDeleteDeck();
  const cloneDeck = useCloneDeck();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <div className="h-6 w-32 bg-white border-[2px] border-slate-200 rounded-xl animate-pulse mb-6" />
          <div className="h-48 brutal-card animate-pulse mb-6" />
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 brutal-card animate-pulse" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 brutal-card animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!deck) return null;
  const isOwner = deck.userId === user?.id;
  const cards = deck.cards || [];

  // Progress stats
  const progressList = deck.progress || [];
  const masteredCount = progressList.filter((p) => p.interval >= 21).length;
  const learningCount = progressList.filter(
    (p) => p.repetitions >= 1 && p.interval < 21,
  ).length;
  const masteredPct = cards.length ? (masteredCount / cards.length) * 100 : 0;
  const learningPct = cards.length ? (learningCount / cards.length) * 100 : 0;

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
    <div className="min-h-screen bg-cream">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <button
          onClick={() => router.push('/flashcards')}
          className="flex items-center gap-2 text-slate-500 hover:text-foreground mb-6 font-semibold transition-colors cursor-pointer text-sm"
        >
          <ArrowLeft size={16} /> Back to Decks
        </button>

        {/* Deck header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="brutal-card p-7 mb-8 relative overflow-hidden"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream border-[1.5px] border-foreground mb-3">
                {deck.visibility === 'PUBLIC' ? (
                  <Globe size={10} className="text-foreground" />
                ) : (
                  <Lock size={10} className="text-foreground" />
                )}
                <span className="text-[9px] text-foreground uppercase font-extrabold tracking-wider">
                  {deck.visibility}
                </span>
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-2 leading-tight">
                {deck.title}
              </h1>
              {deck.description && (
                <p className="text-slate-500 mb-4 text-sm leading-relaxed">
                  {deck.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1.5 font-semibold">
                  <BookOpen size={14} /> {cards.length} cards
                </span>
                {deck.user && (
                  <span>
                    by{' '}
                    <strong className="text-foreground">
                      {deck.user.displayName || 'Anonymous'}
                    </strong>
                  </span>
                )}
              </div>
              {deck.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {deck.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 text-[11px] bg-secondary text-secondary-foreground rounded-full border border-teal-200 font-bold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isOwner && (
                <IconBtn
                  onClick={() => router.push(`/flashcards/${deckId}/edit`)}
                  title="Edit"
                >
                  <Edit size={15} />
                </IconBtn>
              )}
              <IconBtn onClick={handleClone} title="Clone">
                <Copy size={15} />
              </IconBtn>
              {isOwner && (
                <IconBtn onClick={handleDelete} title="Delete" danger>
                  <Trash2 size={15} />
                </IconBtn>
              )}
            </div>
          </div>

          {/* Shimmering progress bar */}
          {cards.length > 0 && (
            <div className="relative mt-6">
              <div className="flex items-center justify-between mb-2 text-[11px] font-bold">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Mastered {Math.round(masteredPct)}%
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Learning {Math.round(learningPct)}%
                  </span>
                </div>
                <span className="text-slate-400 tabular-nums">
                  {masteredCount + learningCount}/{cards.length}
                </span>
              </div>
              <div className="relative h-3 w-full rounded-full bg-slate-100 border-[1.5px] border-foreground overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${masteredPct + learningPct}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                  className="relative h-full overflow-hidden"
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(90deg, #22C55E 0%, #22C55E ${
                        masteredCount
                          ? (masteredCount / (masteredCount + learningCount || 1)) * 100
                          : 0
                      }%, #F59E0B ${
                        masteredCount
                          ? (masteredCount / (masteredCount + learningCount || 1)) * 100
                          : 0
                      }%, #F59E0B 100%)`,
                    }}
                  />
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                </motion.div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Action Tiles */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12"
        >
          <ActionTile
            icon={<Play size={22} strokeWidth={2.5} />}
            label="Flip Cards"
            desc="Classic study mode"
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
            onClick={() => router.push(`/flashcards/${deckId}/study?tab=flip`)}
          />
          <ActionTile
            icon={<Sparkles size={22} strokeWidth={2.5} />}
            label="Study with AI"
            desc="Mixed AI practice"
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            onClick={() => router.push(`/flashcards/${deckId}/study?tab=ai`)}
          />
          <ActionTile
            icon={<Brain size={22} strokeWidth={2.5} />}
            label="Review"
            desc="Spaced repetition"
            iconBg="bg-purple-100"
            iconColor="text-purple-600"
            onClick={() => router.push(`/flashcards/review?deckId=${deckId}`)}
          />
        </motion.div>

        {/* Card List */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-extrabold text-foreground">
            Cards ({cards.length})
          </h2>
          <TrendingUp size={16} className="text-slate-400" />
        </div>
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          {cards.map((card, i) => {
            const progress = deck.progress?.find(
              (p) => p.flashcardId === card.id,
            );
            const status =
              progress && progress.interval >= 21
                ? 'mastered'
                : progress && progress.repetitions >= 1
                  ? 'learning'
                  : 'new';
            return (
              <motion.div
                key={card.id}
                variants={listItem}
                whileHover={{ x: 4 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                className="brutal-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 flex items-start gap-3 min-w-0">
                    <span className="text-xs font-extrabold text-foreground bg-cream border-[1.5px] border-foreground rounded-lg w-7 h-7 flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-foreground">
                          {card.word}
                        </span>
                        {card.ipa && (
                          <span className="text-xs text-slate-500 font-mono">
                            {card.ipa}
                          </span>
                        )}
                        {card.audioUrl && (
                          <Volume2
                            size={13}
                            className="text-slate-400 cursor-pointer hover:text-primary"
                          />
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5">
                        {card.meaning}
                      </p>
                      {card.exampleSentence && (
                        <p className="text-xs text-slate-400 mt-1 italic">
                          &ldquo;{card.exampleSentence}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <style jsx global>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  danger?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ y: 1 }}
      onClick={onClick}
      title={title}
      className={`brutal-btn w-10 h-10 flex items-center justify-center bg-white ${
        danger
          ? 'text-slate-500 hover:text-destructive'
          : 'text-slate-500 hover:text-primary'
      }`}
    >
      {children}
    </motion.button>
  );
}

function ActionTile({
  icon,
  label,
  desc,
  iconBg,
  iconColor,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  iconBg: string;
  iconColor: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      variants={{
        hidden: { opacity: 0, y: 24, scale: 0.95 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: 'spring' as const, stiffness: 240, damping: 22 },
        },
      }}
      whileHover={{ y: -6 }}
      whileTap={{ y: 1 }}
      onClick={onClick}
      className="brutal-card p-5 cursor-pointer text-left"
    >
      <div className="flex flex-col items-start gap-3">
        <div
          className={`w-12 h-12 rounded-xl ${iconBg} border-[2px] border-foreground flex items-center justify-center ${iconColor}`}
        >
          {icon}
        </div>
        <div>
          <div className="font-extrabold text-foreground text-base">{label}</div>
          <div className="text-xs text-slate-500 font-medium">{desc}</div>
        </div>
      </div>
    </motion.button>
  );
}

function StatusBadge({ status }: { status: 'mastered' | 'learning' | 'new' }) {
  const styles = {
    mastered: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    learning: 'bg-amber-50 text-amber-700 border-amber-300',
    new: 'bg-slate-50 text-slate-500 border-slate-300',
  }[status];
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border-[1.5px] shrink-0 uppercase tracking-wider ${styles}`}
    >
      {label}
    </span>
  );
}
