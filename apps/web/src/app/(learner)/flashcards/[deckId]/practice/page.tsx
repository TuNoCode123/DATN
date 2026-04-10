'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useStartPractice,
  useSubmitAnswer,
  useCompletePractice,
  type SessionQuestion,
  type AnswerResult,
} from '@/features/flashcards/use-flashcard-queries';
import { ArrowLeft, Check, X, Loader2, ChevronRight, Trophy, RotateCcw, Dumbbell, ListChecks, Keyboard, PenLine, SlidersHorizontal } from 'lucide-react';

type Phase = 'config' | 'loading' | 'question' | 'feedback' | 'complete';

export default function PracticeModePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const startPractice = useStartPractice();
  const submitAnswer = useSubmitAnswer();
  const completePractice = useCompletePractice();

  const [phase, setPhase] = useState<Phase>('config');
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<SessionQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [results, setResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });

  // Config state
  const [questionCount, setQuestionCount] = useState(10);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['MULTIPLE_CHOICE']);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleStart = () => {
    setPhase('loading');
    startPractice.mutate(
      { deckId, questionTypes: selectedTypes, questionCount },
      {
        onSuccess: (data) => {
          setSessionId(data.session.id);
          setQuestions(data.questions);
          setPhase('question');
        },
        onError: () => setPhase('config'),
      },
    );
  };

  const currentQ = questions[currentIndex];

  const handleSubmitAnswer = () => {
    if (!currentQ) return;
    const answer =
      currentQ.questionType === 'MULTIPLE_CHOICE' ? selectedAnswer : typedAnswer;
    if (!answer.trim()) return;

    submitAnswer.mutate(
      { sessionId, flashcardId: currentQ.flashcardId, userAnswer: answer },
      {
        onSuccess: (result) => {
          setFeedback(result);
          setResults((prev) => ({
            correct: prev.correct + (result.isCorrect ? 1 : 0),
            total: prev.total + 1,
          }));
          setPhase('feedback');
        },
      },
    );
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer('');
      setTypedAnswer('');
      setFeedback(null);
      setPhase('question');
    } else {
      completePractice.mutate(sessionId);
      setPhase('complete');
    }
  };

  if (phase === 'config') {
    const questionTypes = [
      { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice', icon: ListChecks, desc: 'Pick the correct answer' },
      { value: 'TYPING', label: 'Typing', icon: Keyboard, desc: 'Type the answer from memory' },
      { value: 'FILL_IN_THE_BLANK', label: 'Fill in the Blank', icon: PenLine, desc: 'Complete the sentence' },
    ];

    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push(`/flashcards/${deckId}`)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm mb-8"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-primary/10 rounded-xl border-[2.5px] border-border-strong flex items-center justify-center shadow-[3px_3px_0px_var(--shadow-brutal)]">
            <Dumbbell size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground font-heading">Practice Mode</h1>
            <p className="text-sm text-muted-foreground">Configure your practice session</p>
          </div>
        </div>

        {/* Question Types */}
        <div className="brutal-card p-5 mb-4">
          <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4 block">
            Question Types
          </label>
          <div className="grid gap-3">
            {questionTypes.map(({ value, label, icon: Icon, desc }) => {
              const isActive = selectedTypes.includes(value);
              return (
                <button
                  key={value}
                  onClick={() => toggleType(value)}
                  className={`flex items-center gap-4 w-full text-left px-4 py-3.5 rounded-xl border-[2.5px] transition-all cursor-pointer ${
                    isActive
                      ? 'border-primary bg-primary/5 shadow-[3px_3px_0px_0px_var(--color-primary)]'
                      : 'border-border-strong bg-white hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-primary border-primary text-white'
                        : 'bg-muted/50 border-border-strong text-muted-foreground'
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground text-sm">{label}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                      isActive
                        ? 'bg-primary border-primary'
                        : 'border-border-strong bg-white'
                    }`}
                  >
                    {isActive && <Check size={12} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Count */}
        <div className="brutal-card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-2">
              <SlidersHorizontal size={14} /> Questions
            </label>
            <span className="text-lg font-bold text-foreground font-heading tabular-nums bg-primary/10 px-3 py-0.5 rounded-lg border border-border-strong">
              {questionCount}
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={50}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full accent-primary h-2 cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground font-medium mt-1">
            <span>5</span><span>50</span>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={selectedTypes.length === 0}
          className="brutal-btn-fill w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed text-base py-3.5 flex items-center gap-2"
        >
          <Dumbbell size={18} /> Start Practice
        </button>

        {selectedTypes.length === 0 && (
          <p className="text-center text-xs text-red-500 mt-3 font-medium">
            Select at least one question type to start
          </p>
        )}
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-muted-foreground">Generating questions with AI...</p>
      </div>
    );
  }

  if (phase === 'complete') {
    const percent = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
    const incorrect = results.total - results.correct;
    const getMessage = () => {
      if (percent === 100) return { text: 'Perfect Score!', emoji: '🎯', sub: 'You nailed every single question!' };
      if (percent >= 80) return { text: 'Excellent Work!', emoji: '🔥', sub: 'You\'re mastering this deck!' };
      if (percent >= 60) return { text: 'Good Effort!', emoji: '💪', sub: 'Keep practicing to improve!' };
      if (percent >= 40) return { text: 'Getting There!', emoji: '📚', sub: 'Review the cards you missed.' };
      return { text: 'Keep Learning!', emoji: '🌱', sub: 'Every practice session counts!' };
    };
    const msg = getMessage();

    return (
      <div className="max-w-md mx-auto px-4 py-12">
        {/* Header card */}
        <div className="brutal-card p-8 mb-4 text-center">
          <div className="text-5xl mb-4">{msg.emoji}</div>
          <h2 className="text-2xl font-bold text-foreground font-heading mb-1">{msg.text}</h2>
          <p className="text-sm text-muted-foreground">{msg.sub}</p>
        </div>

        {/* Score ring + stats */}
        <div className="brutal-card p-6 mb-4">
          <div className="flex items-center gap-6">
            {/* Circular score */}
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-muted)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={percent >= 70 ? 'var(--color-primary)' : percent >= 40 ? '#eab308' : '#ef4444'}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${percent * 2.64} 264`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold font-heading text-foreground">{percent}%</span>
              </div>
            </div>

            {/* Stats breakdown */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary border-[1.5px] border-border-strong" />
                  <span className="text-sm text-muted-foreground">Correct</span>
                </div>
                <span className="text-lg font-bold text-foreground font-heading">{results.correct}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400 border-[1.5px] border-border-strong" />
                  <span className="text-sm text-muted-foreground">Incorrect</span>
                </div>
                <span className="text-lg font-bold text-foreground font-heading">{incorrect}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t-2 border-border-strong">
                <span className="text-sm font-semibold text-muted-foreground">Total</span>
                <span className="text-lg font-bold text-foreground font-heading">{results.total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push(`/flashcards/${deckId}`)}
            className="brutal-btn justify-center py-3"
          >
            <ArrowLeft size={16} /> Back to Deck
          </button>
          <button
            onClick={() => {
              setPhase('config');
              setCurrentIndex(0);
              setResults({ correct: 0, total: 0 });
            }}
            className="brutal-btn-fill justify-center py-3 flex items-center gap-2"
          >
            <RotateCcw size={16} /> Try Again
          </button>
        </div>
      </div>
    );
  }

  // Question or Feedback phase
  const progressPercent = ((currentIndex + (phase === 'feedback' ? 1 : 0)) / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => router.push(`/flashcards/${deckId}`)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-semibold cursor-pointer text-sm"
        >
          <ArrowLeft size={16} /> Exit
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question</span>
          <span className="bg-foreground text-background text-sm font-bold px-2.5 py-0.5 rounded-lg">
            {currentIndex + 1}/{questions.length}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-8 border-[2px] border-border-strong">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Question Type Badge */}
      <div className="mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] bg-primary/10 text-primary rounded-lg border-[2px] border-primary/30">
          {currentQ?.questionType === 'MULTIPLE_CHOICE' && <ListChecks size={13} />}
          {currentQ?.questionType === 'TYPING' && <Keyboard size={13} />}
          {currentQ?.questionType === 'FILL_IN_THE_BLANK' && <PenLine size={13} />}
          {currentQ?.questionType?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Question Card */}
      <div className="brutal-card p-6 mb-6 hover:transform-none hover:shadow-[4px_4px_0px_var(--shadow-brutal)]">
        <p className="text-lg text-foreground font-semibold leading-relaxed">{currentQ?.question}</p>
      </div>

      {/* Answer Input */}
      {phase === 'question' && currentQ && (
        <>
          {currentQ.questionType === 'MULTIPLE_CHOICE' && currentQ.options ? (
            <div className="space-y-3 mb-6">
              {(currentQ.options as string[]).map((option, i) => {
                const isSelected = selectedAnswer === option;
                const letter = String.fromCharCode(65 + i);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedAnswer(option)}
                    className={`group w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-xl border-[2.5px] transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-[3px_3px_0px_0px_var(--color-primary)] -translate-y-0.5'
                        : 'border-border-strong bg-white hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.15)] hover:-translate-y-0.5'
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-lg border-[2.5px] flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary text-white'
                          : 'border-border-strong bg-muted/40 text-muted-foreground group-hover:border-primary/50 group-hover:text-foreground'
                      }`}
                    >
                      {letter}
                    </span>
                    <span className={`font-medium text-[15px] ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>
                      {option}
                    </span>
                    {isSelected && (
                      <Check size={18} className="ml-auto text-primary shrink-0" strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mb-6">
              <input
                type="text"
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                placeholder="Type your answer..."
                autoFocus
                className="w-full px-5 py-4 border-[2.5px] border-border-strong rounded-xl bg-white focus:outline-none focus:border-primary focus:shadow-[3px_3px_0px_0px_var(--color-primary)] text-foreground text-lg font-medium transition-all"
              />
            </div>
          )}

          <button
            onClick={handleSubmitAnswer}
            disabled={
              submitAnswer.isPending ||
              (currentQ.questionType === 'MULTIPLE_CHOICE' ? !selectedAnswer : !typedAnswer.trim())
            }
            className="brutal-btn-fill w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed text-base py-3.5 flex items-center gap-2"
          >
            {submitAnswer.isPending ? (
              <><Loader2 size={18} className="animate-spin" /> Checking...</>
            ) : (
              'Submit Answer'
            )}
          </button>
        </>
      )}

      {/* Feedback */}
      {phase === 'feedback' && feedback && (
        <div className="space-y-4">
          <div
            className={`p-5 rounded-xl border-[2.5px] ${
              feedback.isCorrect
                ? 'bg-emerald-50 border-emerald-500 shadow-[3px_3px_0px_0px_rgb(16,185,129)]'
                : 'bg-red-50 border-red-400 shadow-[3px_3px_0px_0px_rgb(239,68,68)]'
            }`}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                feedback.isCorrect ? 'bg-emerald-500' : 'bg-red-500'
              }`}>
                {feedback.isCorrect ? (
                  <Check size={18} className="text-white" strokeWidth={3} />
                ) : (
                  <X size={18} className="text-white" strokeWidth={3} />
                )}
              </div>
              <span className={`font-bold text-lg ${feedback.isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>
                {feedback.isCorrect ? 'Correct!' : 'Incorrect'}
              </span>
            </div>
            {!feedback.isCorrect && (
              <p className="text-sm text-foreground mb-2 bg-white/60 rounded-lg px-3 py-2 border border-red-200">
                Correct answer: <strong className="text-red-700">{feedback.correctAnswer}</strong>
              </p>
            )}
            {feedback.explanation && (
              <p className="text-sm text-muted-foreground leading-relaxed">{feedback.explanation}</p>
            )}
          </div>

          <button
            onClick={handleNext}
            className="brutal-btn-fill w-full justify-center flex items-center gap-2 text-base py-3.5"
          >
            {currentIndex < questions.length - 1 ? (
              <>Next Question <ChevronRight size={18} /></>
            ) : (
              <>See Results <Trophy size={18} /></>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
