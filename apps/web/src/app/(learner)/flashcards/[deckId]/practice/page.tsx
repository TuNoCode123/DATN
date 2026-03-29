'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useStartPractice,
  useSubmitAnswer,
  useCompletePractice,
  type SessionQuestion,
  type AnswerResult,
} from '@/features/flashcards/use-flashcard-queries';
import { ArrowLeft, Check, X, Loader2, ChevronRight, Trophy, RotateCcw } from 'lucide-react';

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
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <button
          onClick={() => router.push(`/flashcards/${deckId}`)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm mb-6"
        >
          <ArrowLeft size={18} /> Back
        </button>

        <h1 className="text-2xl font-bold text-foreground mb-6">Practice Mode</h1>

        <div className="brutal-card p-6 space-y-6">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground mb-3 block">Question Types</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
                { value: 'TYPING', label: 'Typing' },
                { value: 'FILL_IN_THE_BLANK', label: 'Fill in the Blank' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => toggleType(value)}
                  className={selectedTypes.includes(value) ? 'brutal-btn-fill' : 'brutal-btn'}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-foreground mb-2 block">
              Number of Questions: {questionCount}
            </label>
            <input
              type="range"
              min={5}
              max={50}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5</span><span>50</span>
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={selectedTypes.length === 0}
            className="brutal-btn-fill w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Practice
          </button>
        </div>
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
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border-[2.5px] border-border-strong">
          <Trophy size={40} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Practice Complete!</h2>
        <p className="text-muted-foreground mb-8">
          You scored {results.correct}/{results.total} ({percent}%)
        </p>

        <div className="w-full h-4 bg-muted rounded-full overflow-hidden mb-8 border-[2.5px] border-border-strong">
          <div
            className={`h-full rounded-full transition-all ${percent >= 70 ? 'bg-primary' : percent >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex justify-center gap-3">
          <button
            onClick={() => router.push(`/flashcards/${deckId}`)}
            className="brutal-btn"
          >
            Back to Deck
          </button>
          <button
            onClick={() => {
              setPhase('config');
              setCurrentIndex(0);
              setResults({ correct: 0, total: 0 });
            }}
            className="brutal-btn-fill flex items-center gap-2"
          >
            <RotateCcw size={16} /> Practice Again
          </button>
        </div>
      </div>
    );
  }

  // Question or Feedback phase
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/flashcards/${deckId}`)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm"
        >
          <ArrowLeft size={18} /> Exit
        </button>
        <span className="text-sm text-muted-foreground">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      {/* Progress */}
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-8 border border-border-strong">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + (phase === 'feedback' ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question Type Badge */}
      <div className="mb-4">
        <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary rounded-full border border-border-strong">
          {currentQ?.questionType?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Question */}
      <div className="brutal-card p-6 mb-6">
        <p className="text-lg text-foreground font-medium">{currentQ?.question}</p>
      </div>

      {/* Answer Input */}
      {phase === 'question' && currentQ && (
        <>
          {currentQ.questionType === 'MULTIPLE_CHOICE' && currentQ.options ? (
            <div className="space-y-3 mb-6">
              {(currentQ.options as string[]).map((option, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedAnswer(option)}
                  className={`w-full text-left px-5 py-3.5 rounded-xl border-[2.5px] transition-all ${
                    selectedAnswer === option
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
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                placeholder="Type your answer..."
                autoFocus
                className="w-full px-5 py-3.5 border-[2.5px] border-border-strong rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground text-lg"
              />
            </div>
          )}

          <button
            onClick={handleSubmitAnswer}
            disabled={
              submitAnswer.isPending ||
              (currentQ.questionType === 'MULTIPLE_CHOICE' ? !selectedAnswer : !typedAnswer.trim())
            }
            className="brutal-btn-fill w-full justify-center disabled:opacity-50"
          >
            {submitAnswer.isPending ? 'Checking...' : 'Submit Answer'}
          </button>
        </>
      )}

      {/* Feedback */}
      {phase === 'feedback' && feedback && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-xl border-[2.5px] ${
              feedback.isCorrect
                ? 'bg-emerald-50 border-border-strong'
                : 'bg-red-50 border-border-strong'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {feedback.isCorrect ? (
                <Check size={20} className="text-emerald-600" />
              ) : (
                <X size={20} className="text-red-600" />
              )}
              <span className={`font-semibold ${feedback.isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>
                {feedback.isCorrect ? 'Correct!' : 'Incorrect'}
              </span>
            </div>
            {!feedback.isCorrect && (
              <p className="text-sm text-foreground mb-1">
                Correct answer: <strong>{feedback.correctAnswer}</strong>
              </p>
            )}
            <p className="text-sm text-muted-foreground">{feedback.explanation}</p>
          </div>

          <button
            onClick={handleNext}
            className="brutal-btn-fill w-full justify-center flex items-center gap-2"
          >
            {currentIndex < questions.length - 1 ? (
              <>Next Question <ChevronRight size={18} /></>
            ) : (
              'See Results'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
