'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateDeck } from '@/features/flashcards/use-flashcard-queries';
import { Plus, Trash2, ArrowLeft, GripVertical } from 'lucide-react';

interface CardForm { word: string; meaning: string; exampleSentence: string; ipa: string; }

export default function CreateDeckPage() {
  const router = useRouter();
  const createDeck = useCreateDeck();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [tagsInput, setTagsInput] = useState('');
  const [cards, setCards] = useState<CardForm[]>([
    { word: '', meaning: '', exampleSentence: '', ipa: '' },
    { word: '', meaning: '', exampleSentence: '', ipa: '' },
  ]);

  const updateCard = (i: number, field: keyof CardForm, value: string) => {
    const u = [...cards]; u[i] = { ...u[i], [field]: value }; setCards(u);
  };
  const addCard = () => setCards([...cards, { word: '', meaning: '', exampleSentence: '', ipa: '' }]);
  const removeCard = (i: number) => { if (cards.length > 1) setCards(cards.filter((_, j) => j !== i)); };

  const handleSubmit = async () => {
    const valid = cards.filter((c) => c.word.trim() && c.meaning.trim());
    if (!title.trim() || valid.length === 0) return;
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      const deck = await createDeck.mutateAsync({
        title: title.trim(), description: description.trim() || undefined, visibility, tags,
        cards: valid.map((c) => ({ word: c.word.trim(), meaning: c.meaning.trim(), exampleSentence: c.exampleSentence.trim() || undefined, ipa: c.ipa.trim() || undefined })),
      });
      router.push(`/flashcards/${deck.id}`);
    } catch (err) { console.error('Failed to create deck:', err); }
  };

  const inputCls = "w-full px-3.5 py-2.5 border-[2.5px] border-border-strong rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground text-sm placeholder:text-muted-foreground";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl border-2 border-border-strong bg-white flex items-center justify-center shadow-[2px_2px_0px_var(--shadow-brutal)] hover:shadow-[3px_3px_0px_var(--shadow-brutal)] hover:-translate-y-[1px] active:shadow-[1px_1px_0px_var(--shadow-brutal)] active:translate-y-[1px] transition-all cursor-pointer">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-2xl font-bold text-foreground font-heading">Create New Deck</h1>
      </div>

      {/* Deck Info */}
      <div className="brutal-card p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wider">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. IELTS Band 7 Vocabulary" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wider">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this deck about?" rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wider">Visibility</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PRIVATE' | 'PUBLIC')} className={inputCls}>
                <option value="PRIVATE">Private</option>
                <option value="PUBLIC">Public</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wider">Tags (comma-separated)</label>
              <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="IELTS, band-7" className={inputCls} />
            </div>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground font-heading">Cards ({cards.filter((c) => c.word.trim()).length})</h2>
        <button onClick={addCard} className="brutal-btn bg-white text-foreground px-3 py-1.5 text-xs flex items-center gap-1.5">
          <Plus size={14} /> Add Card
        </button>
      </div>

      <div className="space-y-3 mb-6">
        {cards.map((card, i) => (
          <div key={i} className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
                <GripVertical size={14} /> Card {i + 1}
              </div>
              <button onClick={() => removeCard(i)} className="p-1 text-muted-foreground hover:text-red-500 cursor-pointer" disabled={cards.length <= 1}>
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">Word *</label>
                <input type="text" value={card.word} onChange={(e) => updateCard(i, 'word', e.target.value)} placeholder="ubiquitous" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">Meaning *</label>
                <input type="text" value={card.meaning} onChange={(e) => updateCard(i, 'meaning', e.target.value)} placeholder="present everywhere" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">Example Sentence</label>
                <input type="text" value={card.exampleSentence} onChange={(e) => updateCard(i, 'exampleSentence', e.target.value)} placeholder="Mobile phones are ubiquitous..." className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">IPA</label>
                <input type="text" value={card.ipa} onChange={(e) => updateCard(i, 'ipa', e.target.value)} placeholder="/juːˈbɪkwɪtəs/" className={inputCls} />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addCard} className="w-full py-3 border-[2.5px] border-dashed border-border-strong rounded-2xl text-muted-foreground hover:text-foreground hover:border-foreground transition-colors flex items-center justify-center gap-2 cursor-pointer font-bold text-sm">
          <Plus size={16} /> Add Another Card
        </button>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={() => router.back()} className="brutal-btn bg-white text-foreground px-5 py-2.5 text-sm">Cancel</button>
        <button onClick={handleSubmit} disabled={!title.trim() || cards.every((c) => !c.word.trim()) || createDeck.isPending}
          className="brutal-btn-fill px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
          {createDeck.isPending ? 'Creating...' : 'Create Deck'}
        </button>
      </div>
    </div>
  );
}
