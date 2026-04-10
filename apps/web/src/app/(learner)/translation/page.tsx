'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TranslationCard } from '@/components/translation/TranslationCard';
import { TranslationScoreCard } from '@/components/translation/TranslationScoreCard';
import { TranslateIllustration } from '@/components/translation/svg/TranslateIllustration';
import { DifficultyWave } from '@/components/translation/svg/DifficultyWave';
import { EmptyState } from '@/components/translation/svg/EmptyState';
import { ProgressRing } from '@/components/translation/svg/ProgressRing';
import Link from 'next/link';
import type { SentencePair, TranslationAssessment } from '@/lib/translation/types';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  Languages,
  History,
  Coins,
  AlertCircle,
  BookOpen,
  GraduationCap,
  Globe,
  MessageSquare,
} from 'lucide-react';

interface Topic {
  id: string;
  name: string;
  description: string | null;
  difficulty: string;
  tags: string[];
}

const DIFFICULTY_STYLES: Record<string, { color: string; gradient: string }> = {
  BEGINNER: {
    color: 'bg-emerald-100 text-emerald-800 border-emerald-400',
    gradient: 'from-emerald-50 to-green-50',
  },
  INTERMEDIATE: {
    color: 'bg-amber-100 text-amber-800 border-amber-400',
    gradient: 'from-amber-50 to-yellow-50',
  },
  ADVANCED: {
    color: 'bg-red-100 text-red-800 border-red-400',
    gradient: 'from-red-50 to-rose-50',
  },
};

const DIFFICULTIES = [
  { value: 'BEGINNER', label: 'Beginner', emoji: '🌱', desc: 'Simple everyday phrases' },
  { value: 'INTERMEDIATE', label: 'Intermediate', emoji: '📚', desc: 'Moderate complexity' },
  { value: 'ADVANCED', label: 'Advanced', emoji: '🎓', desc: 'Complex & idiomatic' },
];

const TOPIC_ICONS = [BookOpen, Globe, MessageSquare, GraduationCap, Languages];

type Phase = 'topics' | 'configure' | 'generating' | 'practicing';

interface SentenceResult {
  assessment: TranslationAssessment;
  userTranslation: string;
}

export default function TranslationPage() {
  const [phase, setPhase] = useState<Phase>('topics');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('BEGINNER');
  const [customReq, setCustomReq] = useState('');
  const [sentencePairs, setSentencePairs] = useState<SentencePair[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, SentenceResult>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const { data: topics = [], isLoading: topicsLoading } = useQuery({
    queryKey: ['translation-topics'],
    queryFn: () => api.get('/translation/topics').then((r) => r.data as Topic[]),
  });

  // Fetch credit balance
  useEffect(() => {
    api.get('/credits').then((r) => setCreditBalance(r.data.balance)).catch(() => {});
  }, []);

  function refreshCredits() {
    api.get('/credits').then((r) => setCreditBalance(r.data.balance)).catch(() => {});
  }

  function selectTopic(topic: Topic) {
    setSelectedTopic(topic);
    setSelectedDifficulty(topic.difficulty);
    setCustomReq('');
    setPhase('configure');
  }

  async function startPractice() {
    if (!selectedTopic) return;

    // Credit check
    if (creditBalance !== null && creditBalance < 5) {
      return; // UI already shows insufficient credits
    }

    setPhase('generating');
    setCurrentIndex(0);
    setResults({});
    setSessionId(null);

    try {
      const res = await api.post('/translation/generate-sentences', {
        topicId: selectedTopic.id,
        customRequirements: customReq || undefined,
        difficulty: selectedDifficulty,
      });
      const generated: SentencePair[] = res.data.sentences;
      setSentencePairs(generated);
      refreshCredits();

      // Create session
      try {
        const sessionRes = await api.post('/translation/sessions', {
          topicId: selectedTopic.id,
          sentencePairs: generated,
        });
        setSessionId(sessionRes.data.id);
      } catch {
        // Don't block practice
      }

      setPhase('practicing');
    } catch {
      setPhase('configure');
    }
  }

  async function handleSubmit(translation: string) {
    const pair = sentencePairs[currentIndex];
    if (!pair) return;

    setIsSubmitting(true);

    try {
      const res = await api.post('/translation/assess', {
        vietnamese: pair.vietnamese,
        referenceEnglish: pair.english,
        userTranslation: translation,
      });

      const assessment: TranslationAssessment = res.data;
      setResults((prev) => ({
        ...prev,
        [currentIndex]: { assessment, userTranslation: translation },
      }));

      refreshCredits();

      // Save to session
      if (sessionId) {
        api
          .post(`/translation/sessions/${sessionId}/results`, {
            sentenceIndex: currentIndex,
            vietnameseSentence: pair.vietnamese,
            referenceEnglish: pair.english,
            userTranslation: translation,
            assessment,
          })
          .catch(() => {});
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Assessment failed';
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  function backToTopics() {
    setPhase('topics');
    setSelectedTopic(null);
    setSentencePairs([]);
    setCustomReq('');
    setSessionId(null);
    setResults({});
  }

  const completedCount = Object.keys(results).length;

  // ─── Topics Phase ─────────────────────────────────────
  if (phase === 'topics') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header with illustration */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-amber-600 via-orange-500 to-indigo-600 bg-clip-text text-transparent">
              Translation Practice
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Vietnamese → English — improve your translation skills
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/translation/history"
              className="brutal-btn px-4 py-2 text-sm flex items-center gap-2 bg-white hover:bg-gray-50"
            >
              <History className="w-4 h-4" />
              History
            </Link>
            {creditBalance !== null && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-bold border-2 border-black rounded-full bg-yellow-100 shadow-[2px_2px_0_0_#1e293b]">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span>{creditBalance}</span>
              </div>
            )}
          </div>
        </div>

        {/* Illustration */}
        <div className="flex justify-center">
          <TranslateIllustration className="w-72 h-44" />
        </div>

        {/* Topics grid */}
        {topicsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <EmptyState className="w-48 h-40" />
            <p className="font-bold text-gray-500 mt-2">No topics available yet</p>
            <p className="text-sm text-gray-400">Ask an admin to create translation topics.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {topics.map((topic, i) => {
              const style = DIFFICULTY_STYLES[topic.difficulty] || DIFFICULTY_STYLES.INTERMEDIATE;
              const Icon = TOPIC_ICONS[i % TOPIC_ICONS.length];
              return (
                <button
                  key={topic.id}
                  onClick={() => selectTopic(topic)}
                  className={cn(
                    'relative overflow-hidden text-left rounded-2xl border-2 border-black p-5',
                    'shadow-[4px_4px_0_0_#1e293b] transition-all duration-200',
                    'hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_#1e293b]',
                    `bg-gradient-to-br ${style.gradient}`,
                  )}
                >
                  <DifficultyWave difficulty={topic.difficulty} className="absolute bottom-0 left-0 right-0 h-8 opacity-60" />
                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/60 border border-black/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-gray-700" />
                        </div>
                        <h3 className="text-lg font-black">{topic.name}</h3>
                      </div>
                      <span className={cn('px-2 py-0.5 text-[10px] font-bold border rounded-full', style.color)}>
                        {topic.difficulty.charAt(0) + topic.difficulty.slice(1).toLowerCase()}
                      </span>
                    </div>
                    {topic.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{topic.description}</p>
                    )}
                    {topic.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {topic.tags.map((t) => (
                          <span key={t} className="px-2 py-0.5 text-[10px] bg-white/50 text-gray-600 rounded-full border border-gray-200">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── Configure Phase ──────────────────────────────────
  if (phase === 'configure' && selectedTopic) {
    const insufficientCredits = creditBalance !== null && creditBalance < 5;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <button onClick={backToTopics} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-1">
            <ArrowLeft className="w-4 h-4" />
            Back to Topics
          </button>
          <h1 className="text-3xl font-black">{selectedTopic.name}</h1>
          {selectedTopic.description && (
            <p className="text-gray-600 text-sm mt-1">{selectedTopic.description}</p>
          )}
        </div>

        {/* Difficulty selector */}
        <div className="rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0_0_#1e293b] p-5 overflow-hidden relative">
          <DifficultyWave difficulty={selectedDifficulty} className="absolute bottom-0 left-0 right-0 h-6" />
          <label className="text-xs font-bold uppercase text-gray-500 mb-3 block">
            Difficulty Level
          </label>
          <div className="flex gap-3 relative z-10">
            {DIFFICULTIES.map((d) => {
              const style = DIFFICULTY_STYLES[d.value];
              return (
                <button
                  key={d.value}
                  onClick={() => setSelectedDifficulty(d.value)}
                  className={cn(
                    'flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all text-center',
                    selectedDifficulty === d.value
                      ? cn(style.color, 'ring-2 ring-offset-1 ring-current scale-[1.03] shadow-md')
                      : 'border-gray-200 text-gray-400 hover:border-gray-400 bg-white',
                  )}
                >
                  <span className="text-lg block mb-0.5">{d.emoji}</span>
                  {d.label}
                  <span className="block text-[10px] font-normal mt-0.5 opacity-70">{d.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom requirements */}
        <div className="rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0_0_#1e293b] p-5">
          <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">
            Custom Requirements (optional)
          </label>
          <textarea
            value={customReq}
            onChange={(e) => setCustomReq(e.target.value)}
            placeholder="e.g. focus on business vocabulary, use formal language, include food-related sentences..."
            rows={3}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none transition-all"
          />
          <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
            <Sparkles className="w-3.5 h-3.5" />
            AI will tailor sentences to your requirements
          </div>
        </div>

        {/* Credit warning */}
        {insufficientCredits && (
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-700 text-sm">Insufficient Credits</p>
              <p className="text-xs text-red-600 mt-1">
                You need at least 5 credits to start. Current balance: {creditBalance}.
                Each session costs 3 credits + 2 per assessment.
              </p>
            </div>
          </div>
        )}

        {/* Cost info */}
        <div className="flex items-center justify-between px-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Coins className="w-3 h-3" /> 3 credits to generate + 2 per sentence
          </span>
          {creditBalance !== null && (
            <span>Balance: {creditBalance} credits</span>
          )}
        </div>

        {/* Start button */}
        <button
          onClick={startPractice}
          disabled={insufficientCredits}
          className={cn(
            'w-full py-4 text-lg font-black flex items-center justify-center gap-2 rounded-2xl border-2 border-black transition-all',
            insufficientCredits
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none border-gray-300'
              : 'bg-gradient-to-r from-amber-400 via-orange-400 to-indigo-500 text-white shadow-[4px_4px_0_0_#1e293b] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_#1e293b]',
          )}
        >
          <Languages className="w-5 h-5" />
          Start Translation Practice
        </button>
      </div>
    );
  }

  // ─── Generating Phase ─────────────────────────────────
  if (phase === 'generating') {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-24 space-y-6">
        <div className="relative">
          <TranslateIllustration className="w-56 h-36 opacity-50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold">
            Generating sentences for &quot;{selectedTopic?.name}&quot;...
          </p>
          <p className="text-sm text-gray-500 mt-1">
            AI is creating Vietnamese-English practice pairs
          </p>
        </div>
        {/* Animated dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-indigo-400"
              style={{
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ─── Practice Phase ───────────────────────────────────
  const pair = sentencePairs[currentIndex];
  const currentResult = results[currentIndex];
  const overallProgress = (completedCount / sentencePairs.length) * 100;
  const insufficientForAssess = creditBalance !== null && creditBalance < 2;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={backToTopics} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-1">
            <ArrowLeft className="w-4 h-4" />
            Back to Topics
          </button>
          <h1 className="text-2xl font-black">{selectedTopic?.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          {creditBalance !== null && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-bold border-2 border-black rounded-full bg-yellow-100 shadow-[2px_2px_0_0_#1e293b]">
              <Coins className="w-3.5 h-3.5 text-amber-600" />
              <span>{creditBalance}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-gray-500">
          Sentence {currentIndex + 1} of {sentencePairs.length}
        </span>
        <span className="font-bold text-indigo-600">
          {completedCount} completed
        </span>
      </div>
      <div className="h-2.5 bg-gray-200 border-2 border-black rounded-full overflow-hidden shadow-[2px_2px_0_0_#1e293b]">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-orange-400 to-indigo-500 transition-all duration-500 ease-out"
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* Insufficient credits warning */}
      {insufficientForAssess && !currentResult && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="text-amber-700">Not enough credits for assessment (need 2). You can still review completed sentences.</span>
        </div>
      )}

      {/* Translation Card or Score Card */}
      {currentResult ? (
        <TranslationScoreCard
          assessment={currentResult.assessment}
          userTranslation={currentResult.userTranslation}
          referenceEnglish={pair.english}
        />
      ) : (
        <TranslationCard
          vietnamese={pair.vietnamese}
          sentenceIndex={currentIndex}
          totalSentences={sentencePairs.length}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          disabled={insufficientForAssess}
        />
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setCurrentIndex((i) => i - 1)}
          disabled={currentIndex === 0}
          className="brutal-btn px-4 py-2 text-sm flex items-center gap-1 bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <ProgressRing progress={overallProgress} size={40} strokeWidth={3}>
          <span className="text-[9px] font-black text-gray-500">
            {Math.round(overallProgress)}%
          </span>
        </ProgressRing>
        <button
          onClick={() => setCurrentIndex((i) => i + 1)}
          disabled={currentIndex === sentencePairs.length - 1}
          className="brutal-btn px-4 py-2 text-sm flex items-center gap-1 bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
