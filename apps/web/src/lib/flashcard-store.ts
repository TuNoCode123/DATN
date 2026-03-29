'use client';

import { create } from 'zustand';

interface FlashcardStore {
  // Study mode
  currentCardIndex: number;
  isFlipped: boolean;
  knownCards: Set<string>;
  unknownCards: Set<string>;

  // Actions
  flipCard: () => void;
  markKnown: (cardId: string) => void;
  markUnknown: (cardId: string) => void;
  nextCard: () => void;
  prevCard: () => void;
  setCardIndex: (index: number) => void;
  reset: () => void;
}

export const useFlashcardStore = create<FlashcardStore>((set) => ({
  currentCardIndex: 0,
  isFlipped: false,
  knownCards: new Set(),
  unknownCards: new Set(),

  flipCard: () => set((s) => ({ isFlipped: !s.isFlipped })),

  markKnown: (cardId) =>
    set((s) => {
      const known = new Set(s.knownCards);
      const unknown = new Set(s.unknownCards);
      known.add(cardId);
      unknown.delete(cardId);
      return { knownCards: known, unknownCards: unknown };
    }),

  markUnknown: (cardId) =>
    set((s) => {
      const known = new Set(s.knownCards);
      const unknown = new Set(s.unknownCards);
      unknown.add(cardId);
      known.delete(cardId);
      return { knownCards: known, unknownCards: unknown };
    }),

  nextCard: () =>
    set((s) => ({ currentCardIndex: s.currentCardIndex + 1, isFlipped: false })),

  prevCard: () =>
    set((s) => ({
      currentCardIndex: Math.max(0, s.currentCardIndex - 1),
      isFlipped: false,
    })),

  setCardIndex: (index) => set({ currentCardIndex: index, isFlipped: false }),

  reset: () =>
    set({
      currentCardIndex: 0,
      isFlipped: false,
      knownCards: new Set(),
      unknownCards: new Set(),
    }),
}));
