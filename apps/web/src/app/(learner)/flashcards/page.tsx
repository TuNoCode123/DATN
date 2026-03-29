'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDecks, useDeleteDeck, useCloneDeck, type Deck } from '@/features/flashcards/use-flashcard-queries';
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
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';

export default function FlashcardsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useDecks({ search: search || undefined, visibility: visibility !== 'ALL' ? visibility : undefined, page, limit: 12 });
  const deleteDeck = useDeleteDeck();
  const cloneDeck = useCloneDeck();

  const decks = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 12);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-heading">Flashcards</h1>
          <p className="text-muted-foreground mt-1">Create and study vocabulary decks</p>
        </div>
        <button
          onClick={() => router.push('/flashcards/create')}
          className="brutal-btn-fill px-5 py-2.5 flex items-center gap-2 text-sm"
        >
          <Plus size={16} />
          Create Deck
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search decks..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border-[2.5px] border-border-strong rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground text-sm"
          />
        </div>
        <div className="flex gap-2">
          {[
            { key: 'ALL', label: 'All' },
            { key: 'PUBLIC', label: 'Public' },
            { key: 'PRIVATE', label: 'My Decks' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setVisibility(key); setPage(1); }}
              className={`brutal-btn px-4 py-2 text-sm ${
                visibility === key
                  ? 'bg-foreground text-white'
                  : 'bg-white text-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Review Banner */}
      <div className="brutal-card p-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-xl border-2 border-border-strong flex items-center justify-center">
            <Brain size={20} className="text-violet-600" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">Spaced Repetition Review</p>
            <p className="text-xs text-muted-foreground">Review your due cards to strengthen memory</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/flashcards/review')}
          className="brutal-btn-fill px-4 py-2 text-xs"
        >
          Start Review
        </button>
      </div>

      {/* Deck Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-white rounded-2xl border-[2.5px] border-gray-200 animate-pulse" />
          ))}
        </div>
      ) : decks.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 bg-muted rounded-xl border-2 border-border-strong flex items-center justify-center mx-auto mb-4">
            <Layers size={24} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No decks found</h3>
          <p className="text-muted-foreground mt-1 text-sm">Create your first flashcard deck to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              isOwner={deck.userId === user?.id}
              onOpen={() => router.push(`/flashcards/${deck.id}`)}
              onClone={() => cloneDeck.mutate(deck.id)}
              onDelete={() => {
                if (confirm('Delete this deck?')) deleteDeck.mutate(deck.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`brutal-btn w-10 h-10 text-sm ${
                page === i + 1 ? 'bg-foreground text-white' : 'bg-white text-foreground'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
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

  return (
    <div className="brutal-card group relative p-5 cursor-pointer" onClick={onOpen}>
      {/* Menu */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 rounded-lg hover:bg-muted cursor-pointer">
          <MoreHorizontal size={16} className="text-muted-foreground" />
        </button>
        {showMenu && (
          <div className="absolute right-0 mt-1 w-36 brutal-card p-1 z-10 !shadow-[3px_3px_0px_var(--shadow-brutal)]">
            <button onClick={() => { onClone(); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted rounded-lg font-medium cursor-pointer">
              <Copy size={14} /> Clone
            </button>
            {isOwner && (
              <button onClick={() => { onDelete(); setShowMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg font-medium cursor-pointer">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Visibility badge */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-6 h-6 rounded-lg border-2 border-border-strong flex items-center justify-center ${deck.visibility === 'PUBLIC' ? 'bg-cyan-100' : 'bg-muted'}`}>
          {deck.visibility === 'PUBLIC' ? <Globe size={11} className="text-cyan-600" /> : <Lock size={11} className="text-muted-foreground" />}
        </div>
        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{deck.visibility}</span>
      </div>

      <h3 className="text-base font-bold text-foreground mb-1 line-clamp-1">{deck.title}</h3>
      {deck.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{deck.description}</p>}

      <div className="flex items-center justify-between mt-auto pt-3 border-t-2 border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <BookOpen size={13} />
          <span>{deck.cardCount || deck._count?.cards || 0} cards</span>
        </div>
        {deck.user && <span className="text-[11px] text-muted-foreground">{deck.user.displayName || 'Anonymous'}</span>}
      </div>

      {deck.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {deck.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-bold">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
