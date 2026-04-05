"use client";

import { Loader2 } from "lucide-react";

interface QuestionItem {
  id: string;
  questionNumber: number;
}

interface SectionGroup {
  id: string;
  title: string;
  questions: QuestionItem[];
}

interface QuestionNavigatorProps {
  sections: SectionGroup[];
  answers: Record<string, string>;
  timeLeft: number | null;
  submitting: boolean;
  onSubmit: () => void;
  onQuestionClick: (sectionIndex: number, questionId: string) => void;
  activeSectionIndex: number;
  activeQuestionId?: string;
}

export function QuestionNavigator({
  sections,
  answers,
  timeLeft,
  submitting,
  onSubmit,
  onQuestionClick,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeSectionIndex: _activeSectionIndex,
  activeQuestionId,
}: QuestionNavigatorProps) {
  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div
      className="flex flex-col bg-white shrink-0 border-l-2 border-border-strong w-[200px]"
    >
      {/* Timer + Submit */}
      <div className="flex flex-col items-stretch px-4 pt-4">
        <div className="mb-3">
          <div className="text-slate-500 text-xs font-medium mb-1">
            {timeLeft !== null ? "Time Remaining:" : "No Time Limit"}
          </div>
          {timeLeft !== null && (
            <div className="font-extrabold text-foreground tabular-nums text-3xl">
              {formatTime(timeLeft)}
            </div>
          )}
        </div>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="brutal-btn bg-foreground text-white py-2.5 w-full text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "SUBMIT"
          )}
        </button>
      </div>

      {/* Note */}
      <div className="px-4 pb-3 border-b border-slate-200">
        <p className="text-red-500 italic text-xs leading-snug">
          Click question numbers to navigate.
        </p>
      </div>

      {/* Question palette */}
      <div className="px-4 py-3 flex-1 overflow-y-auto">
        {sections.map((section, sIdx) => (
          <div key={section.id} className="mb-4">
            <div className="font-bold text-foreground text-xs mb-2">
              {section.title}
            </div>
            <div className="flex flex-wrap gap-1">
              {section.questions.map((q) => {
                const isAnswered = !!answers[q.id]?.trim();
                const isCurrent = activeQuestionId === q.id;

                return (
                  <button
                    key={q.id}
                    onClick={() => onQuestionClick(sIdx, q.id)}
                    className={`rounded-lg border-2 text-center transition-colors tabular-nums cursor-pointer ${
                      isCurrent
                        ? "bg-amber-100 text-amber-700 border-amber-400"
                        : isAnswered
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-slate-600 border-slate-200 hover:border-primary"
                    }`}
                    style={{
                      width: 28,
                      height: 28,
                      fontSize: 11,
                      lineHeight: "24px",
                    }}
                  >
                    {q.questionNumber}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
