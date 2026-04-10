'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PronunciationTrainer } from '@/components/pronunciation/PronunciationTrainer';
import { CreditBadge } from '@/components/pronunciation/CreditBadge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { PronunciationAssessment } from '@/lib/pronunciation/types';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  Mic,
  History,
} from 'lucide-react';

interface Topic {
  id: string;
  name: string;
  description: string | null;
  difficulty: string;
  tags: string[];
}

const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER: 'bg-green-100 text-green-800 border-green-500',
  INTERMEDIATE: 'bg-yellow-100 text-yellow-800 border-yellow-500',
  ADVANCED: 'bg-red-100 text-red-800 border-red-500',
};

const DIFFICULTIES = [
  { value: 'BEGINNER', label: 'Beginner', color: 'bg-green-100 text-green-800 border-green-500' },
  { value: 'INTERMEDIATE', label: 'Intermediate', color: 'bg-yellow-100 text-yellow-800 border-yellow-500' },
  { value: 'ADVANCED', label: 'Advanced', color: 'bg-red-100 text-red-800 border-red-500' },
];

type Phase = 'topics' | 'configure' | 'generating' | 'practicing';

export default function PronunciationPage() {
  const [phase, setPhase] = useState<Phase>('topics');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('BEGINNER');
  const [customReq, setCustomReq] = useState('');
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { data: topics = [], isLoading: topicsLoading } = useQuery({
    queryKey: ['pronunciation-topics'],
    queryFn: () =>
      api.get('/pronunciation/topics').then((r) => r.data as Topic[]),
  });

  function selectTopic(topic: Topic) {
    setSelectedTopic(topic);
    setSelectedDifficulty(topic.difficulty);
    setCustomReq('');
    setPhase('configure');
  }

  async function startPractice() {
    if (!selectedTopic) return;
    setPhase('generating');
    setCurrentIndex(0);
    setCompletedCount(0);
    setSessionId(null);

    try {
      const res = await api.post('/pronunciation/generate-sentences', {
        topicId: selectedTopic.id,
        customRequirements: customReq || undefined,
        difficulty: selectedDifficulty,
      });
      const generatedSentences: string[] = res.data.sentences;
      setSentences(generatedSentences);

      // Create a session to track history
      try {
        const sessionRes = await api.post('/pronunciation/sessions', {
          topicId: selectedTopic.id,
          sentences: generatedSentences,
        });
        setSessionId(sessionRes.data.id);
      } catch {
        // Don't block practice if session creation fails
      }

      setPhase('practicing');
    } catch {
      setPhase('topics');
    }
  }

  function handleSentenceComplete(
    index: number,
    assessment: PronunciationAssessment,
    spokenText: string,
  ) {
    setCompletedCount((c) => c + 1);

    // Save result to session
    if (sessionId) {
      api
        .post(`/pronunciation/sessions/${sessionId}/results`, {
          sentenceIndex: index,
          targetSentence: sentences[index],
          spokenText,
          assessment,
        })
        .catch(() => {
          // Don't block UX
        });
    }
  }

  function backToTopics() {
    setPhase('topics');
    setSelectedTopic(null);
    setSentences([]);
    setCustomReq('');
    setSessionId(null);
  }

  function backToConfigure() {
    setPhase('configure');
  }

  // ─── Topic Selection Phase ───────────────────────────
  if (phase === 'topics') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">Pronunciation Practice</h1>
            <p className="text-gray-600 text-sm mt-1">
              Pick a topic and start speaking
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/pronunciation/history"
              className="brutal-btn px-4 py-2 text-sm flex items-center gap-2 bg-white hover:bg-gray-50"
            >
              <History className="w-4 h-4" />
              History
            </Link>
            <CreditBadge />
          </div>
        </div>

        {/* Topics grid */}
        {topicsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : topics.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Mic className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-bold">No topics available yet</p>
            <p className="text-sm">Ask an admin to create pronunciation topics.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => selectTopic(topic)}
                className="brutal-card p-5 text-left hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_#1e293b] transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-black">{topic.name}</h3>
                  <span
                    className={cn(
                      'px-2 py-0.5 text-xs font-bold border rounded-full',
                      DIFFICULTY_COLORS[topic.difficulty],
                    )}
                  >
                    {topic.difficulty.charAt(0) +
                      topic.difficulty.slice(1).toLowerCase()}
                  </span>
                </div>
                {topic.description && (
                  <p className="text-sm text-gray-600 mb-3">
                    {topic.description}
                  </p>
                )}
                {topic.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {topic.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full border border-gray-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Configure Phase ─────────────────────────────────
  if (phase === 'configure' && selectedTopic) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <button
            onClick={backToTopics}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Topics
          </button>
          <h1 className="text-3xl font-black">{selectedTopic.name}</h1>
          {selectedTopic.description && (
            <p className="text-gray-600 text-sm mt-1">{selectedTopic.description}</p>
          )}
        </div>

        {/* Difficulty selector */}
        <div className="brutal-card p-5">
          <label className="text-xs font-bold uppercase text-gray-500 mb-3 block">
            Difficulty Level
          </label>
          <div className="flex gap-3">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                onClick={() => setSelectedDifficulty(d.value)}
                className={cn(
                  'flex-1 py-3 px-4 rounded-lg border-2 font-bold text-sm transition-all',
                  selectedDifficulty === d.value
                    ? cn(d.color, 'border-current ring-2 ring-offset-1 ring-current scale-[1.02]')
                    : 'border-gray-200 text-gray-400 hover:border-gray-400',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom requirements */}
        <div className="brutal-card p-5">
          <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">
            Custom Requirements (optional)
          </label>
          <div className="flex gap-2">
            <textarea
              value={customReq}
              onChange={(e) => setCustomReq(e.target.value)}
              placeholder="e.g. focus on past tense, use formal language, include questions, topic about airports..."
              rows={3}
              className="flex-1 px-3 py-2 border-2 border-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
            <Sparkles className="w-3.5 h-3.5" />
            AI will tailor sentences to your requirements
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={startPractice}
          className="brutal-btn-fill w-full py-4 text-lg font-black flex items-center justify-center gap-2"
        >
          <Mic className="w-5 h-5" />
          Start Practice
        </button>
      </div>
    );
  }

  // ─── Generating Phase ────────────────────────────────
  if (phase === 'generating') {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-24 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-green-500" />
        <p className="text-lg font-bold">
          Generating sentences for &quot;{selectedTopic?.name}&quot;...
        </p>
        <p className="text-sm text-gray-500">
          AI is creating personalized practice content
        </p>
      </div>
    );
  }

  // ─── Practice Phase ──────────────────────────────────
  const sentence = sentences[currentIndex];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={backToTopics}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Topics
          </button>
          <h1 className="text-2xl font-black">{selectedTopic?.name}</h1>
        </div>
        <CreditBadge />
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-500">
          Sentence {currentIndex + 1} of {sentences.length}
        </span>
        <span className="text-sm font-bold text-green-600">
          {completedCount} completed
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 border border-black rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / sentences.length) * 100}%`,
          }}
        />
      </div>

      {/* Trainer */}
      <PronunciationTrainer
        key={`${selectedTopic?.id}-${currentIndex}`}
        targetSentence={sentence}
        onComplete={(assessment, spokenText) =>
          handleSentenceComplete(currentIndex, assessment, spokenText)
        }
      />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={() => setCurrentIndex((i) => i - 1)}
          disabled={currentIndex === 0}
          className="brutal-btn px-4 py-2 text-sm flex items-center gap-1 bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <button
          onClick={() => setCurrentIndex((i) => i + 1)}
          disabled={currentIndex === sentences.length - 1}
          className="brutal-btn px-4 py-2 text-sm flex items-center gap-1 bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
