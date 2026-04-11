'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  useDecks,
  useDeleteDeck,
  useCloneDeck,
  type Deck,
} from '@/features/flashcards/use-flashcard-queries';
import {
  Search,
  Plus,
  Globe,
  Lock,
  BookOpen,
  Copy,
  Trash2,
  MoreHorizontal,
  Layers,
  Brain,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 240, damping: 24 },
  },
};

// Deterministic pastel accent per deck — matches the home page TestCard palette
const ACCENTS = [
  { bg: 'bg-rose-100', text: 'text-rose-600', ring: 'bg-rose-400' },
  { bg: 'bg-blue-100', text: 'text-blue-600', ring: 'bg-blue-400' },
  { bg: 'bg-purple-100', text: 'text-purple-600', ring: 'bg-purple-400' },
  { bg: 'bg-emerald-100', text: 'text-emerald-600', ring: 'bg-emerald-400' },
  { bg: 'bg-amber-100', text: 'text-amber-600', ring: 'bg-amber-400' },
];

function pickAccent(id: string) {
  const h = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return ACCENTS[h % ACCENTS.length];
}

export default function FlashcardsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useDecks({
    search: search || undefined,
    visibility: visibility !== 'ALL' ? visibility : undefined,
    page,
    limit: 12,
  });
  const deleteDeck = useDeleteDeck();
  const cloneDeck = useCloneDeck();

  const decks = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 12);

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-10"
        >
          <div>
            <span className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground text-xs font-semibold px-4 py-2 rounded-full border border-teal-200 mb-4">
              <Sparkles size={12} />
              AI-Powered Learning
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-foreground leading-[1.1]">
              Your <span className="text-primary italic">Flashcards</span>
            </h1>
            <p className="text-slate-500 mt-3 text-base max-w-lg">
              Create, study, and master vocabulary with intelligent decks.
            </p>
          </div>
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 1 }}
            onClick={() => router.push('/flashcards/create')}
            className="brutal-btn bg-primary text-white px-6 py-3 text-sm flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus size={16} />
            <span>Create Deck</span>
          </motion.button>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-col sm:flex-row gap-3 mb-6"
        >
          <div className="relative flex-1 brutal-card rounded-full overflow-hidden">
            <Search
              size={16}
              className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search your decks…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-transparent pl-12 pr-5 py-3 text-foreground placeholder:text-slate-400 focus:outline-none text-sm font-medium"
            />
          </div>
          <div
            className="flex gap-1 p-1 rounded-full border-[2.5px] border-foreground bg-white"
            style={{ boxShadow: '3px 3px 0px #1E293B' }}
          >
            {[
              { key: 'ALL', label: 'All' },
              { key: 'PUBLIC', label: 'Public' },
              { key: 'PRIVATE', label: 'Mine' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setVisibility(key);
                  setPage(1);
                }}
                className={`relative px-5 py-2 text-sm font-semibold rounded-full cursor-pointer ${
                  visibility === key
                    ? 'text-white'
                    : 'text-slate-500 hover:text-foreground'
                }`}
              >
                {visibility === key && (
                  <motion.div
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-full bg-foreground"
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Review Banner */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          whileHover={{ y: -2 }}
          className="brutal-card p-5 mb-10 flex items-center justify-between cursor-pointer group"
          onClick={() => router.push('/flashcards/review')}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 border-[2px] border-foreground flex items-center justify-center">
              <Brain size={22} className="text-purple-600" />
            </div>
            <div>
              <p className="font-extrabold text-foreground">
                Spaced Repetition Review
              </p>
              <p className="text-sm text-slate-500">
                Review your due cards to strengthen memory
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground group-hover:translate-x-1 transition-transform">
            Start <ArrowRight size={16} />
          </div>
        </motion.div>

        {/* Deck Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-56 brutal-card relative overflow-hidden"
              >
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-slate-100 to-transparent" />
              </div>
            ))}
          </div>
        ) : decks.length === 0 ? (
          <div className="brutal-card text-center py-20 px-6">
            <div className="w-16 h-16 rounded-xl bg-blue-100 border-[2px] border-foreground flex items-center justify-center mx-auto mb-4">
              <Layers size={28} className="text-blue-600" />
            </div>
            <h3 className="text-xl font-extrabold text-foreground">
              No decks found
            </h3>
            <p className="text-slate-500 mt-1.5 text-sm">
              Create your first flashcard deck to get started
            </p>
          </div>
        ) : (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {decks.map((deck) => (
              <motion.div key={deck.id} variants={item}>
                <DeckCard
                  deck={deck}
                  isOwner={deck.userId === user?.id}
                  onOpen={() => router.push(`/flashcards/${deck.id}`)}
                  onClone={() => cloneDeck.mutate(deck.id)}
                  onDelete={() => {
                    if (confirm('Delete this deck?')) deleteDeck.mutate(deck.id);
                  }}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-12">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`brutal-btn w-11 h-11 text-sm font-bold ${
                  page === i + 1
                    ? 'bg-primary text-white'
                    : 'bg-white text-foreground'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
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

function DeckCard({
  deck,
  isOwner,
  onOpen,
  onClone,
  onDelete,
}: {
  deck: Deck;
  isOwner: boolean;
  onOpen: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const cardCount = deck.cardCount || deck._count?.cards || 0;
  const accent = pickAccent(deck.id);

  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className="group relative cursor-pointer h-full"
      onClick={onOpen}
    >
      <div className="brutal-card relative p-5 h-full flex flex-col overflow-hidden">
        {/* Menu */}
        <div
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg bg-white border-[1.5px] border-foreground hover:bg-cream cursor-pointer"
          >
            <MoreHorizontal size={16} className="text-foreground" />
          </button>
          {showMenu && (
            <div
              className="absolute right-0 mt-1 w-36 rounded-xl bg-white border-[2px] border-foreground p-1 z-10"
              style={{ boxShadow: '3px 3px 0px #1E293B' }}
            >
              <button
                onClick={() => {
                  onClone();
                  setShowMenu(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-cream rounded-lg font-semibold cursor-pointer"
              >
                <Copy size={14} /> Clone
              </button>
              {isOwner && (
                <button
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-rose-50 rounded-lg font-semibold cursor-pointer"
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          )}
        </div>

        {/* Top: visibility badge + icon */}
        <div className="flex items-start justify-between mb-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream border-[1.5px] border-foreground">
            {deck.visibility === 'PUBLIC' ? (
              <Globe size={10} className="text-foreground" />
            ) : (
              <Lock size={10} className="text-foreground" />
            )}
            <span className="text-[9px] text-foreground uppercase font-extrabold tracking-wider">
              {deck.visibility}
            </span>
          </span>
          <div
            className={`w-12 h-12 rounded-xl ${accent.bg} border-[2px] border-foreground flex items-center justify-center`}
          >
            <Layers size={20} className={accent.text} strokeWidth={2.5} />
          </div>
        </div>

        <h3 className="text-lg font-extrabold text-foreground mb-1 line-clamp-1">
          {deck.title}
        </h3>
        {deck.description && (
          <p className="text-sm text-slate-500 mb-3 line-clamp-2">
            {deck.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-4 border-t-[1.5px] border-slate-200">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
            <BookOpen size={13} />
            <span>{cardCount} cards</span>
          </div>
          {deck.user && (
            <span className="text-[11px] text-slate-400 font-medium">
              {deck.user.displayName || 'Anonymous'}
            </span>
          )}
        </div>

        {deck.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {deck.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] bg-secondary text-secondary-foreground rounded-full border border-teal-200 font-bold"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
