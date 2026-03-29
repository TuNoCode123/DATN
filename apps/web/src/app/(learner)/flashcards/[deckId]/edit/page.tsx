'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useDeck,
  useUpdateDeck,
  useAddCards,
  useUpdateCard,
  useDeleteCard,
} from '@/features/flashcards/use-flashcard-queries';
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from 'lucide-react';

export default function EditDeckPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const { data: deck, isLoading } = useDeck(deckId);
  const updateDeck = useUpdateDeck();
  const addCards = useAddCards(deckId);
  const updateCard = useUpdateCard(deckId);
  const deleteCard = useDeleteCard(deckId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [tagsInput, setTagsInput] = useState('');
  const [newCards, setNewCards] = useState<{ word: string; meaning: string; exampleSentence: string; ipa: string }[]>([]);

  useEffect(() => {
    if (deck) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(deck.title);
      setDescription(deck.description || '');
      setVisibility(deck.visibility);
      setTagsInput(deck.tags.join(', '));
    }
  }, [deck]);

  if (isLoading || !deck) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="h-8 w-32 bg-muted rounded animate-pulse mb-6" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  const handleSaveDeck = async () => {
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    await updateDeck.mutateAsync({ id: deckId, title, description: description || undefined, visibility, tags });
  };

  const handleSaveCard = async (cardId: string, field: string, value: string) => {
    await updateCard.mutateAsync({ cardId, [field]: value });
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm('Delete this card?')) return;
    await deleteCard.mutateAsync(cardId);
  };

  const handleAddNewCards = async () => {
    const valid = newCards.filter((c) => c.word.trim() && c.meaning.trim());
    if (valid.length === 0) return;
    await addCards.mutateAsync(valid.map((c) => ({
      word: c.word.trim(),
      meaning: c.meaning.trim(),
      exampleSentence: c.exampleSentence.trim() || undefined,
      ipa: c.ipa.trim() || undefined,
    })));
    setNewCards([]);
  };

  const inputClasses = "w-full px-4 py-2.5 border-[2.5px] border-border-strong rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground text-sm";
  const smallInputClasses = "px-3 py-2 border-[2.5px] border-border-strong rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-foreground">Edit Deck</h1>
      </div>

      {/* Deck Info */}
      <div className="brutal-card p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground mb-1 block">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClasses} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground mb-1 block">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputClasses} resize-none`} />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-bold uppercase tracking-wider text-foreground mb-1 block">Visibility</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PRIVATE' | 'PUBLIC')} className={inputClasses}>
                <option value="PRIVATE">Private</option>
                <option value="PUBLIC">Public</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold uppercase tracking-wider text-foreground mb-1 block">Tags</label>
              <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className={inputClasses} />
            </div>
          </div>
          <button
            onClick={handleSaveDeck}
            disabled={updateDeck.isPending}
            className="brutal-btn-fill flex items-center gap-2"
          >
            {updateDeck.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Deck Info
          </button>
        </div>
      </div>

      {/* Existing Cards */}
      <h2 className="text-lg font-semibold text-foreground mb-4">Cards ({deck.cards?.length || 0})</h2>
      <div className="space-y-3 mb-6">
        {deck.cards?.map((card, i) => (
          <div key={card.id} className="brutal-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Card {i + 1}</span>
              <button onClick={() => handleDeleteCard(card.id)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                defaultValue={card.word}
                onBlur={(e) => e.target.value !== card.word && handleSaveCard(card.id, 'word', e.target.value)}
                className={smallInputClasses}
                placeholder="Word"
              />
              <input
                defaultValue={card.meaning}
                onBlur={(e) => e.target.value !== card.meaning && handleSaveCard(card.id, 'meaning', e.target.value)}
                className={smallInputClasses}
                placeholder="Meaning"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add New Cards */}
      <h3 className="text-md font-semibold text-foreground mb-3">Add New Cards</h3>
      {newCards.map((card, i) => (
        <div key={i} className="brutal-card bg-muted p-4 mb-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              value={card.word}
              onChange={(e) => { const c = [...newCards]; c[i] = { ...c[i], word: e.target.value }; setNewCards(c); }}
              className={smallInputClasses}
              placeholder="Word"
            />
            <input
              value={card.meaning}
              onChange={(e) => { const c = [...newCards]; c[i] = { ...c[i], meaning: e.target.value }; setNewCards(c); }}
              className={smallInputClasses}
              placeholder="Meaning"
            />
          </div>
        </div>
      ))}
      <div className="flex gap-3">
        <button
          onClick={() => setNewCards([...newCards, { word: '', meaning: '', exampleSentence: '', ipa: '' }])}
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium cursor-pointer"
        >
          <Plus size={16} /> Add Card
        </button>
        {newCards.length > 0 && (
          <button
            onClick={handleAddNewCards}
            disabled={addCards.isPending}
            className="brutal-btn-fill flex items-center gap-1.5 text-sm disabled:opacity-50"
          >
            {addCards.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save New Cards
          </button>
        )}
      </div>
    </div>
  );
}
