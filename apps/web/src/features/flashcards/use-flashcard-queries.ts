'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────

export interface Flashcard {
  id: string;
  deckId: string;
  word: string;
  meaning: string;
  exampleSentence?: string;
  ipa?: string;
  audioUrl?: string;
  imageUrl?: string;
  orderIndex: number;
}

export interface Deck {
  id: string;
  userId: string;
  title: string;
  description?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  cardCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
  cards?: Flashcard[];
  _count?: { cards: number };
}

export interface UserCardProgress {
  id: string;
  userId: string;
  flashcardId: string;
  familiarity: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: string;
}

export interface StudySession {
  id: string;
  type: 'STUDY' | 'PRACTICE' | 'TEST' | 'REVIEW';
  totalCards: number;
  knownCount: number;
  correctCount: number;
  scorePercent?: number;
  completedAt?: string;
}

export interface SessionQuestion {
  id: string;
  flashcardId: string;
  questionType: 'MULTIPLE_CHOICE' | 'TYPING' | 'FILL_IN_THE_BLANK';
  question: string;
  options?: string[];
  userAnswer?: string;
}

export interface AnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
}

export interface TestResult {
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  answers: {
    flashcardId: string;
    questionType: string;
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
  }[];
}

export interface ReviewStats {
  totalCards: number;
  dueToday: number;
  learnedCards: number;
  masteredCards: number;
  streakDays: number;
  reviewsByDay: { date: string; count: number }[];
}

// ─── Deck Queries ────────────────────────────────────────

export function useDecks(params?: {
  search?: string;
  visibility?: string;
  tags?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['decks', params],
    queryFn: async () => {
      const { data } = await api.get('/flashcards/decks', { params });
      return data as { data: Deck[]; total: number; page: number; limit: number };
    },
  });
}

export function useDeck(deckId: string) {
  return useQuery({
    queryKey: ['deck', deckId],
    queryFn: async () => {
      const { data } = await api.get(`/flashcards/decks/${deckId}`);
      return data as Deck & { progress: UserCardProgress[] };
    },
    enabled: !!deckId,
  });
}

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      title: string;
      description?: string;
      visibility?: string;
      tags?: string[];
      cards: { word: string; meaning: string; exampleSentence?: string; ipa?: string }[];
    }) => {
      const { data } = await api.post('/flashcards/decks', body);
      return data as Deck;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decks'] }),
  });
}

export function useUpdateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; title?: string; description?: string; visibility?: string; tags?: string[] }) => {
      const { data } = await api.patch(`/flashcards/decks/${id}`, body);
      return data as Deck;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck', vars.id] });
    },
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/flashcards/decks/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decks'] }),
  });
}

export function useCloneDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/flashcards/decks/${id}/clone`);
      return data as Deck;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decks'] }),
  });
}

// ─── Card Mutations ──────────────────────────────────────

export function useAddCards(deckId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cards: { word: string; meaning: string; exampleSentence?: string; ipa?: string }[]) => {
      const { data } = await api.post(`/flashcards/decks/${deckId}/cards`, { cards });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deck', deckId] }),
  });
}

export function useUpdateCard(deckId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, ...body }: { cardId: string; word?: string; meaning?: string; exampleSentence?: string; ipa?: string }) => {
      const { data } = await api.patch(`/flashcards/decks/${deckId}/cards/${cardId}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deck', deckId] }),
  });
}

export function useDeleteCard(deckId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cardId: string) => {
      await api.delete(`/flashcards/decks/${deckId}/cards/${cardId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deck', deckId] }),
  });
}

// ─── Study Mode ──────────────────────────────────────────

export function useStartStudy() {
  return useMutation({
    mutationFn: async (deckId: string) => {
      const { data } = await api.post(`/flashcards/decks/${deckId}/study/start`);
      return data as { session: StudySession; cards: Flashcard[] };
    },
  });
}

export function useRecordFlip() {
  return useMutation({
    mutationFn: async ({ sessionId, flashcardId, known }: { sessionId: string; flashcardId: string; known: boolean }) => {
      const { data } = await api.post(`/flashcards/sessions/${sessionId}/flip`, { flashcardId, known });
      return data;
    },
  });
}

export function useCompleteStudy() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data } = await api.post(`/flashcards/sessions/${sessionId}/study/complete`);
      return data as StudySession;
    },
  });
}

// ─── Practice Mode ───────────────────────────────────────

export function useStartPractice() {
  return useMutation({
    mutationFn: async ({ deckId, ...body }: { deckId: string; questionTypes?: string[]; questionCount?: number }) => {
      const { data } = await api.post(`/flashcards/decks/${deckId}/practice/start`, body);
      return data as { session: { id: string; type: string; totalCards: number }; questions: SessionQuestion[] };
    },
  });
}

export function useSubmitAnswer() {
  return useMutation({
    mutationFn: async ({ sessionId, flashcardId, userAnswer }: { sessionId: string; flashcardId: string; userAnswer: string }) => {
      const { data } = await api.post(`/flashcards/sessions/${sessionId}/answer`, { flashcardId, userAnswer });
      return data as AnswerResult;
    },
  });
}

export function useCompletePractice() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data } = await api.post(`/flashcards/sessions/${sessionId}/practice/complete`);
      return data;
    },
  });
}

// ─── Test Mode ───────────────────────────────────────────

export function useStartTest() {
  return useMutation({
    mutationFn: async ({ deckId, ...body }: { deckId: string; questionCount?: number; questionTypes?: string[] }) => {
      const { data } = await api.post(`/flashcards/decks/${deckId}/test/start`, body);
      return data as { session: { id: string; type: string; totalCards: number }; questions: SessionQuestion[] };
    },
  });
}

export function useSubmitTest() {
  return useMutation({
    mutationFn: async ({ sessionId, answers }: { sessionId: string; answers: { answerId: string; userAnswer: string }[] }) => {
      const { data } = await api.post(`/flashcards/sessions/${sessionId}/test/submit`, { answers });
      return data as TestResult;
    },
  });
}

// ─── Review Mode ─────────────────────────────────────────

export function useDueCards(deckId?: string) {
  return useQuery({
    queryKey: ['review-due', deckId],
    queryFn: async () => {
      const { data } = await api.get('/flashcards/review/due', { params: { deckId } });
      return data;
    },
  });
}

export function useStartReview() {
  return useMutation({
    mutationFn: async (deckId?: string) => {
      const { data } = await api.post('/flashcards/review/start', { deckId });
      return data;
    },
  });
}

export function useRateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, flashcardId, quality }: { sessionId: string; flashcardId: string; quality: number }) => {
      const { data } = await api.post(`/flashcards/review/${sessionId}/rate`, { flashcardId, quality });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-due'] }),
  });
}

export function useReviewStats() {
  return useQuery({
    queryKey: ['review-stats'],
    queryFn: async () => {
      const { data } = await api.get('/flashcards/review/stats');
      return data as ReviewStats;
    },
  });
}
