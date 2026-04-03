'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useStartTest,
  useSubmitTest,
  type SessionQuestion,
  type TestResult,
} from '@/features/flashcards/use-flashcard-queries';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Trophy, Check, X, RotateCcw } from 'lucide-react';

type Phase = 'config' | 'loading' | 'test' | 'results';

export default function TestModePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const startTest = useStartTest();
  const submitTest = useSubmitTest();

  const [phase, setPhase] = useState<Phase>('config');
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<SessionQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [result, setResult] = useState<TestResult | null>(null);

  // Config
  const [questionCount, setQuestionCount] = useState(20);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['MULTIPLE_CHOICE', 'TYPING', 'FILL_IN_THE_BLANK']);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleStart = () => {
    setPhase('loading');
    startTest.mutate(
      { deckId, questionCount, questionTypes: selectedTypes },
      {
        onSuccess: (data) => {
          setSessionId(data.session.id);
          setQuestions(data.questions);
          setPhase('test');
        },
        onError: () => setPhase('config'),
      },
    );
  };

  const setAnswer = (questionId: string, answer: string) => {
    const newAnswers = new Map(answers);
    newAnswers.set(questionId, answer);
    setAnswers(newAnswers);
  };

  const handleSubmit = () => {
    if (!confirm(`Submit test with ${answers.size}/${questions.length} answered?`)) return;

    submitTest.mutate(
      {
        sessionId,
        answers: questions.map((q) => ({
          answerId: q.id,
          userAnswer: answers.get(q.id) || '',
        })),
      },
      {
        onSuccess: (data) => {
          setResult(data);
          setPhase('results');
        },
      },
    );
  };

  const currentQ = questions[currentIndex];
  const answeredCount = answers.size;

  if (phase === 'config') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <button onClick={() => router.push(`/flashcards/${deckId}`)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm mb-6">
          <ArrowLeft size={18} /> Back
        </button>
        <h1 className="text-2xl font-bold text-foreground mb-6">Test Mode</h1>
        <div className="brutal-card p-6 space-y-6">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground mb-3 block">Question Types</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
                { value: 'TYPING', label: 'Typing' },
                { value: 'FILL_IN_THE_BLANK', label: 'Fill in the Blank' },
              ].map(({ value, label }) => (
                <button key={value} onClick={() => toggleType(value)} className={selectedTypes.includes(value) ? 'brutal-btn-fill' : 'brutal-btn'}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground mb-2 block">Questions: {questionCount}</label>
            <input type="range" min={5} max={50} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <button onClick={handleStart} disabled={selectedTypes.length === 0} className="brutal-btn-fill w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">
            Start Test
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-muted-foreground">Generating test questions...</p>
      </div>
    );
  }

  if (phase === 'results' && result) {
    const percent = Math.round(result.scorePercent);
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border-[2.5px] border-border-strong">
            <Trophy size={40} className="text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Test Complete!</h2>
          <p className="text-4xl font-bold mt-4" style={{ color: percent >= 70 ? '#22c55e' : percent >= 40 ? '#eab308' : '#ef4444' }}>
            {percent}%
          </p>
          <p className="text-muted-foreground">{result.correctCount}/{result.totalQuestions} correct</p>
        </div>

        <div className="space-y-3 mb-8">
          {result.answers.map((a, i) => (
            <div key={i} className={`p-4 rounded-xl border-[2.5px] border-border-strong ${a.isCorrect ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className="flex items-start gap-2">
                {a.isCorrect ? <Check size={18} className="text-emerald-600 mt-0.5" /> : <X size={18} className="text-red-600 mt-0.5" />}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{a.question}</p>
                  {!a.isCorrect && (
                    <p className="text-sm text-foreground mt-1">Your answer: <span className="text-red-600">{a.userAnswer || '(no answer)'}</span> | Correct: <span className="text-emerald-600 font-medium">{a.correctAnswer}</span></p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{a.explanation}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-3">
          <button onClick={() => router.push(`/flashcards/${deckId}`)} className="brutal-btn">
            Back to Deck
          </button>
          <button onClick={() => { setPhase('config'); setCurrentIndex(0); setAnswers(new Map()); setResult(null); }} className="brutal-btn-fill flex items-center gap-2">
            <RotateCcw size={16} /> Retake Test
          </button>
        </div>
      </div>
    );
  }

  // Test phase — show current question with navigation
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => { if (confirm('Leave test? Progress will be lost.')) router.push(`/flashcards/${deckId}`); }} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm">
          <ArrowLeft size={18} /> Exit
        </button>
        <span className="text-sm text-muted-foreground">{answeredCount}/{questions.length} answered</span>
      </div>

      {/* Question navigator */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setCurrentIndex(i)}
            className={`w-8 h-8 rounded-lg text-xs font-bold border-[2px] border-border-strong transition-all ${
              i === currentIndex
                ? 'bg-primary text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.8)]'
                : answers.has(q.id)
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-white text-muted-foreground hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Question */}
      <div className="mb-2">
        <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary rounded-full border border-border-strong">
          {currentQ?.questionType?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="brutal-card p-6 mb-6">
        <p className="text-lg text-foreground font-medium">{currentQ?.question}</p>
      </div>

      {/* Answer input */}
      {currentQ?.questionType === 'MULTIPLE_CHOICE' && currentQ.options ? (
        <div className="space-y-3 mb-6">
          {(currentQ.options as string[]).map((option, i) => (
            <button
              key={i}
              onClick={() => setAnswer(currentQ.id, option)}
              className={`w-full text-left px-5 py-3.5 rounded-xl border-[2.5px] transition-all ${
                answers.get(currentQ.id) === option
                  ? 'border-primary bg-primary/5 text-foreground shadow-[3px_3px_0px_0px_var(--color-primary)]'
                  : 'border-border-strong bg-white hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)] text-foreground'
              }`}
            >
              <span className="font-medium mr-3 text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
              {option}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-6">
          <input
            type="text"
            value={answers.get(currentQ?.id || '') || ''}
            onChange={(e) => currentQ && setAnswer(currentQ.id, e.target.value)}
            placeholder="Type your answer..."
            className="w-full px-5 py-3.5 border-[2.5px] border-border-strong rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground text-lg"
          />
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm disabled:opacity-30"
        >
          <ChevronLeft size={18} /> Previous
        </button>

        {currentIndex < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIndex(currentIndex + 1)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm"
          >
            Next <ChevronRight size={18} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitTest.isPending}
            className="brutal-btn-fill disabled:opacity-50"
          >
            {submitTest.isPending ? 'Submitting...' : 'Submit Test'}
          </button>
        )}
      </div>
    </div>
  );
}
