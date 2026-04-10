'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, X, ChevronRight, SkipForward, Lightbulb, Zap } from 'lucide-react';
import { useSubmitAnswer, type SessionQuestion, type AnswerResult } from '@/features/flashcards/use-flashcard-queries';

interface QuestionStepProps {
  sessionId: string;
  question: SessionQuestion;
  word: string;
  onComplete: (result: AnswerResult | null) => void;
  onSkip: () => void;
}

function ConfettiBurst() {
  const colors = ['#818cf8', '#fbbf24', '#34d399', '#f472b6', '#60a5fa', '#fb7185'];
  const pieces = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${10 + Math.random() * 80}%`,
    delay: `${Math.random() * 0.4}s`,
    size: 4 + Math.random() * 5,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 confetti-piece"
          style={{
            left: p.left,
            animationDelay: p.delay,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export default function QuestionStep({ sessionId, question, word, onComplete, onSkip }: QuestionStepProps) {
  const submitAnswer = useSubmitAnswer();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shakeWrong, setShakeWrong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMultipleChoice = question.questionType === 'MULTIPLE_CHOICE';
  const isTyping = question.questionType === 'TYPING';
  const isFillBlank = question.questionType === 'FILL_IN_THE_BLANK';

  useEffect(() => {
    if ((isTyping || isFillBlank) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTyping, isFillBlank]);

  const handleSubmit = async (answer: string) => {
    if (!answer.trim() || submitAnswer.isPending) return;
    try {
      const result = await submitAnswer.mutateAsync({
        sessionId,
        flashcardId: question.flashcardId,
        userAnswer: answer.trim(),
      });
      setFeedback(result);
      if (result.isCorrect) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2500);
      } else {
        setShakeWrong(true);
        setTimeout(() => setShakeWrong(false), 600);
      }
    } catch {}
  };

  const handleOptionClick = (option: string) => {
    if (feedback) return;
    setSelectedOption(option);
    handleSubmit(option);
  };

  const typeLabel = isMultipleChoice ? 'Choose the correct answer' : isTyping ? 'Type the word' : 'Fill in the blank';

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto">
      {showConfetti && <ConfettiBurst />}

      {/* Question card */}
      <div className="w-full rounded-2xl border-[2.5px] border-border-strong bg-gradient-to-br from-amber-50/80 via-white to-orange-50/50 p-6 sm:p-8 mb-6 shadow-[4px_4px_0px_var(--shadow-brutal)] slide-up-in">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-600">
            {typeLabel}
          </span>
        </div>
        <h3 className="text-lg sm:text-xl font-bold text-foreground leading-snug font-heading">
          {question.question}
        </h3>
      </div>

      {/* Multiple Choice */}
      {isMultipleChoice && question.options && (
        <div className={`w-full space-y-2.5 mb-6 ${shakeWrong ? 'shake-wrong' : ''}`}>
          {question.options.map((option, i) => {
            const isSelected = selectedOption === option;
            const isCorrect = feedback?.correctAnswer === option;
            const isWrong = isSelected && feedback && !feedback.isCorrect;

            let styles = 'border-border bg-white hover:bg-amber-50/50 hover:border-amber-300 hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_var(--shadow-brutal)]';
            let letterBg = 'bg-gray-100 text-gray-500';

            if (feedback) {
              if (isCorrect) {
                styles = 'border-emerald-400 bg-emerald-50 shadow-[3px_3px_0px_rgba(16,185,129,0.2)]';
                letterBg = 'bg-emerald-500 text-white';
              } else if (isWrong) {
                styles = 'border-red-300 bg-red-50/80';
                letterBg = 'bg-red-500 text-white';
              } else {
                styles = 'border-border bg-gray-50/50 opacity-60';
              }
            }

            return (
              <button
                key={i}
                onClick={() => handleOptionClick(option)}
                disabled={!!feedback || submitAnswer.isPending}
                className={`w-full text-left px-4 py-3.5 rounded-xl border-[2.5px] font-medium text-sm transition-all cursor-pointer disabled:cursor-default shadow-[3px_3px_0px_var(--shadow-brutal)] ${styles} ${
                  isCorrect && feedback ? 'correct-glow' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 transition-colors ${letterBg}`}>
                    {OPTION_LETTERS[i]}
                  </span>
                  <span className="flex-1">{option}</span>
                  {feedback && isCorrect && <Check size={18} className="text-emerald-600 shrink-0" strokeWidth={3} />}
                  {feedback && isWrong && <X size={18} className="text-red-500 shrink-0" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Typing / Fill in the blank */}
      {(isTyping || isFillBlank) && !feedback && (
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(typedAnswer); }} className="w-full mb-6 slide-up-in" style={{ animationDelay: '100ms' }}>
          <div className="relative mb-3">
            <input
              ref={inputRef}
              type="text"
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder={isFillBlank ? 'Type the missing word...' : 'Type your answer...'}
              className="w-full px-5 py-4 rounded-xl border-[2.5px] border-border-strong bg-white text-foreground font-semibold text-base focus:outline-none focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(251,191,36,0.15)] transition-all shadow-[3px_3px_0px_var(--shadow-brutal)]"
              disabled={submitAnswer.isPending}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={!typedAnswer.trim() || submitAnswer.isPending}
            className="w-full rounded-xl border-[2.5px] border-amber-600/30 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold py-3.5 text-sm shadow-[3px_3px_0px_rgba(245,158,11,0.3)] active:shadow-[1px_1px_0px_rgba(245,158,11,0.3)] active:translate-y-[2px] transition-all disabled:opacity-40 cursor-pointer"
          >
            {submitAnswer.isPending ? 'Checking...' : 'Submit Answer'}
          </button>
        </form>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`w-full rounded-2xl border-[2.5px] p-5 mb-6 slide-up-in shadow-[3px_3px_0px_var(--shadow-brutal)] ${
          feedback.isCorrect
            ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50/50'
            : 'border-red-200 bg-gradient-to-br from-red-50 to-rose-50/50'
        }`}>
          <div className="flex items-center gap-2.5 mb-2.5">
            {feedback.isCorrect ? (
              <>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
                  <Check size={16} className="text-white" strokeWidth={3} />
                </div>
                <span className="font-black text-emerald-700 font-heading text-base">Correct!</span>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center shadow-sm">
                  <X size={16} className="text-white" strokeWidth={3} />
                </div>
                <span className="font-black text-red-600 font-heading text-base">Not quite</span>
              </>
            )}
          </div>
          {!feedback.isCorrect && (
            <p className="text-sm text-foreground mb-1.5 pl-[42px]">
              <span className="text-muted-foreground">Answer: </span>
              <strong className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">{feedback.correctAnswer}</strong>
            </p>
          )}
          <div className="flex items-start gap-2 pl-[42px]">
            <Lightbulb size={13} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">{feedback.explanation}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {feedback ? (
        <button
          onClick={() => onComplete(feedback)}
          className="brutal-btn-fill px-6 py-2.5 text-sm flex items-center gap-2"
        >
          Continue <ChevronRight size={14} />
        </button>
      ) : (
        <button
          onClick={onSkip}
          className="mt-1 text-xs text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <SkipForward size={11} /> Skip
        </button>
      )}
    </div>
  );
}
