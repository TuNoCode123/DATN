"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowLeft,
  Clock,
  Target,
  Check,
  X as XIcon,
  Minus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AudioPlayer } from "@/components/ui/audio-player";
import { TranscriptSection } from "@/components/ui/transcript-section";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ───────────────────────────────────────────────
interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  correctAnswer: string;
  explanation: string | null;
  options: unknown;
  imageUrl: string | null;
  audioUrl: string | null;
  transcript: string | null;
}
interface QuestionGroupFromAPI {
  id: string;
  questionType: string;
  orderIndex: number;
  instructions: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  passage: PassageFromAPI | null;
  questions: QuestionFromAPI[];
}
interface PassageFromAPI {
  id: string;
  title: string | null;
  contentHtml: string;
  imageUrl: string | null;
  audioUrl: string | null;
  transcript: string | null;
  images?: Array<{ url: string; layout?: string; size?: string }> | null;
  orderIndex: number;
}
interface SectionFromAPI {
  id: string;
  title: string;
  skill: string;
  orderIndex: number;
  passages: PassageFromAPI[];
  questionGroups: QuestionGroupFromAPI[];
}
interface AnswerFromAPI {
  id: string;
  questionId: string;
  answerText: string | null;
  isCorrect: boolean | null;
}
interface AttemptResultFromAPI {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  submittedAt: string;
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  test: { id: string; title: string };
  sections: { sectionId: string; section: SectionFromAPI }[];
  answers: AnswerFromAPI[];
}

// ─── Helpers ─────────────────────────────────────────────
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getQuestionTypeLabel(type: string): string {
  const map: Record<string, string> = {
    MULTIPLE_CHOICE: "Multiple Choice",
    TRUE_FALSE_NOT_GIVEN: "True/False/Not Given",
    YES_NO_NOT_GIVEN: "Yes/No/Not Given",
    NOTE_COMPLETION: "Note Completion",
    TABLE_COMPLETION: "Table Completion",
    FORM_COMPLETION: "Form Completion",
    SENTENCE_COMPLETION: "Sentence Completion",
    SUMMARY_COMPLETION: "Summary Completion",
    SHORT_ANSWER: "Short Answer",
    LABELLING: "Labelling",
    MATCHING_HEADINGS: "Matching Headings",
    MATCHING_INFORMATION: "Matching Information",
    MATCHING_FEATURES: "Matching Features",
    MATCHING_SENTENCE_ENDINGS: "Matching Sentence Endings",
  };
  return map[type] || type;
}

// ─── Sub-components ──────────────────────────────────────
function QuestionNumberBadge({
  num,
  status,
}: {
  num: number;
  status: "correct" | "wrong" | "skipped";
}) {
  const styles: Record<string, string> = {
    correct: "border-2 border-emerald-400 text-emerald-600 bg-emerald-50",
    wrong: "border-2 border-red-300 text-red-500 bg-red-50",
    skipped: "border-2 border-slate-200 text-slate-400 bg-white",
  };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg font-bold text-xs shrink-0 ${styles[status]}`}
      style={{ width: 26, height: 26 }}
    >
      {num}
    </span>
  );
}

// ─── Question Detail Modal ──────────────────────────────
interface QuestionDetailProps {
  open: boolean;
  onClose: () => void;
  question: QuestionFromAPI;
  group: QuestionGroupFromAPI;
  section: SectionFromAPI;
  testTitle: string;
  userAnswer: string | null;
  status: "correct" | "wrong" | "skipped";
}

function QuestionDetailModal({
  open,
  onClose,
  question,
  group,
  section,
  testTitle,
  userAnswer,
  status,
}: QuestionDetailProps) {
  const [showExplanation, setShowExplanation] = useState(false);

  // Resolve audio/image: question-level first, then group-level, then passage-level
  const passage = group.passage;
  const audioUrl = question.audioUrl || group.audioUrl || passage?.audioUrl;
  const hasMultiImages = passage?.images && Array.isArray(passage.images) && passage.images.length > 0;
  const imageUrl = question.imageUrl || group.imageUrl || (!hasMultiImages ? passage?.imageUrl : null);
  const transcript = question.transcript || passage?.transcript;

  // Check if passage has meaningful content (not just placeholder text)
  const hasPassageContent = (() => {
    if (!passage?.contentHtml) return false;
    const stripped = passage.contentHtml.replace(/<[^>]*>/g, "").trim();
    if (!stripped) return false;
    if (/^enter passage text here/i.test(stripped)) return false;
    return true;
  })();

  // Parse options (could be array of strings or array of {label, text})
  const options: { label: string; text: string }[] = (() => {
    if (!question.options) return [];
    const opts = question.options;
    if (Array.isArray(opts)) {
      return opts.map((o: unknown, i: number) => {
        if (typeof o === "string") {
          return { label: String.fromCharCode(65 + i), text: o };
        }
        const obj = o as { label?: string; text?: string };
        return { label: obj.label || String.fromCharCode(65 + i), text: obj.text || String(o) };
      });
    }
    return [];
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            Chi tiết câu #{question.questionNumber}
          </DialogTitle>
          <p className="text-sm text-primary font-medium">{testTitle}</p>
          <span className="inline-block w-fit text-xs bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-slate-600 font-medium">
            #{section.title}
          </span>
        </DialogHeader>

        {/* Audio Player */}
        {audioUrl && (
          <AudioPlayer src={audioUrl} />
        )}

        {/* Image + Passage title + Transcript in same scrollable block */}
        {(imageUrl || hasMultiImages || hasPassageContent || transcript || group.instructions) && (
          <div className="border border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto text-sm text-slate-700 leading-relaxed">
            {/* Multiple images */}
            {hasMultiImages && passage!.images!.map((img, idx) => (
              <div key={idx} className="rounded-lg overflow-hidden mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={`Question ${question.questionNumber} - image ${idx + 1}`}
                  className="w-full object-contain max-h-80"
                />
              </div>
            ))}
            {/* Single image */}
            {imageUrl && (
              <div className="rounded-lg overflow-hidden mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={`Question ${question.questionNumber}`}
                  className="w-full object-contain max-h-80"
                />
              </div>
            )}

            {/* Passage title + content */}
            {hasPassageContent && (
              <>
                {passage!.title && (
                  <p className="font-semibold text-slate-900 mb-2">{passage!.title}</p>
                )}
                <div className="rich-content" dangerouslySetInnerHTML={{ __html: passage!.contentHtml }} />
              </>
            )}

            {/* Transcript dropdown below image & passage */}
            {transcript && (
              <TranscriptSection html={transcript} className={imageUrl || hasPassageContent ? "mt-3" : ""} />
            )}

            {/* Group instructions */}
            {group.instructions && (
              <div className={`border border-amber-200 bg-amber-50 rounded-lg p-3 ${imageUrl || hasPassageContent || transcript ? "mt-4" : ""}`}>
                <p className="font-semibold text-amber-800 mb-1 text-xs uppercase tracking-wide">Hướng dẫn</p>
                <div className="rich-content" dangerouslySetInnerHTML={{ __html: group.instructions }} />
              </div>
            )}
          </div>
        )}

        {/* Question number + stem + options */}
        <div>
          {question.stem && (
            <div className="flex items-start gap-3 mb-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white font-bold text-xs shrink-0 mt-0.5">
                {question.questionNumber}
              </span>
              <div
                className="text-sm text-slate-700 leading-relaxed rich-content"
                dangerouslySetInnerHTML={{ __html: question.stem }}
              />
            </div>
          )}

          {/* No stem + no options: fill-in-blank inline */}
          {!question.stem && options.length === 0 && (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white font-bold text-xs shrink-0">
                {question.questionNumber}
              </span>
              <div
                className={`px-3 py-2 rounded border-2 text-sm min-w-[120px] ${
                  status === "correct"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : status === "wrong"
                      ? "border-red-300 bg-red-50 text-red-600"
                      : "border-slate-200 bg-slate-50 text-slate-400 italic"
                }`}
              >
                {userAnswer || "Chưa trả lời"}
              </div>
            </div>
          )}

        {/* Options (MCQ) - question number aligned beside options */}
        {options.length > 0 && (
          <div className="flex items-start gap-3">
            {!question.stem && (
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white font-bold text-xs shrink-0 mt-1.5">
                {question.questionNumber}
              </span>
            )}
            <div className={`space-y-0.5 flex-1 ${question.stem ? 'ml-10' : ''}`}>
              {options.map((opt) => {
                const isUserChoice = userAnswer?.toUpperCase() === opt.label.toUpperCase();
                const isCorrectOption = question.correctAnswer.toUpperCase() === opt.label.toUpperCase();

                return (
                  <label
                    key={opt.label}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isCorrectOption
                        ? "bg-emerald-50 border border-emerald-300"
                        : isUserChoice
                          ? "bg-red-50 border border-red-300"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 text-xs font-bold shrink-0 ${
                        isCorrectOption
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : isUserChoice
                            ? "border-red-400 bg-red-400 text-white"
                            : "border-slate-300 text-slate-500"
                      }`}
                    >
                      {isUserChoice || isCorrectOption ? (
                        isCorrectOption ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <XIcon className="w-3 h-3" />
                        )
                      ) : null}
                    </span>
                    <span className={`${isCorrectOption ? "font-semibold text-emerald-700" : isUserChoice ? "text-red-600 line-through" : "text-slate-700"}`}>
                      {opt.label}.{opt.text && opt.text !== opt.label ? ` ${opt.text}` : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Fill-in-the-blank with stem: show answer below */}
        {options.length === 0 && question.stem && (
          <div className="mt-3">
            <div
              className={`px-3 py-2 rounded border-2 text-sm min-w-[120px] ${
                status === "correct"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : status === "wrong"
                    ? "border-red-300 bg-red-50 text-red-600"
                    : "border-slate-200 bg-slate-50 text-slate-400 italic"
              }`}
            >
              {userAnswer || "Chưa trả lời"}
            </div>
          </div>
        )}
        </div>


        {/* Correct answer display */}
        <div className="text-sm">
          <span className="text-slate-500">Đáp án đúng:</span>
          <span className="font-bold text-primary ml-1">{question.correctAnswer}</span>
          {userAnswer && status !== "correct" && (
            <>
              <span className="text-slate-400 mx-2">|</span>
              <span className="text-slate-500">Bạn chọn: </span>
              <span className="font-bold text-red-500">{userAnswer}</span>
            </>
          )}
          {status === "correct" && (
            <>
              <span className="text-slate-400 mx-2">|</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
              <span className="text-emerald-600 ml-1 font-medium">Chính xác!</span>
            </>
          )}
          {status === "skipped" && (
            <>
              <span className="text-slate-400 mx-2">|</span>
              <span className="text-slate-400 italic">Chưa trả lời</span>
            </>
          )}
        </div>

        {/* Explanation toggle */}
        {question.explanation && (
          <div>
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="flex items-center gap-1 text-sm text-primary font-medium hover:underline cursor-pointer"
            >
              Giải thích chi tiết đáp án
              {showExplanation ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            {showExplanation && (
              <div
                className="mt-2 text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-200 rich-content max-h-48 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: question.explanation }}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ────────────────────────────────────────────────
function ResultContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = params.id as string;
  const attemptId = searchParams.get("attemptId");

  const [selectedQuestion, setSelectedQuestion] = useState<{
    question: QuestionFromAPI;
    group: QuestionGroupFromAPI;
    section: SectionFromAPI;
  } | null>(null);

  const { data: attempt, isLoading } = useQuery({
    queryKey: ["result", attemptId],
    queryFn: async () => {
      if (!attemptId) throw new Error("No attemptId");
      const { data } = await api.get(`/attempts/${attemptId}/result`);
      return data as AttemptResultFromAPI;
    },
    enabled: !!attemptId,
  });

  if (isLoading || !attempt) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const answerMap: Record<string, AnswerFromAPI> = {};
  attempt.answers.forEach((a) => {
    answerMap[a.questionId] = a;
  });

  const sections = attempt.sections
    .map((as) => as.section)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const total = attempt.totalQuestions;
  const correct = attempt.correctCount;
  const answered = attempt.answers.filter((a) => a.answerText?.trim()).length;
  const wrong = answered - correct;
  const skipped = total - answered;

  const timeSpent = attempt.submittedAt
    ? Math.floor(
        (new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000,
      )
    : 0;

  const accuracyPct =
    answered > 0 ? ((correct / answered) * 100).toFixed(1) + "%" : "0.0%";

  interface AnalysisRow {
    sectionTitle: string;
    type: string;
    questions: QuestionFromAPI[];
  }
  const analysisRows: AnalysisRow[] = [];
  sections.forEach((s) =>
    s.questionGroups.forEach((g) =>
      analysisRows.push({
        sectionTitle: s.title,
        type: `[${s.skill === "LISTENING" ? "Listening" : "Reading"}] ${getQuestionTypeLabel(g.questionType)}`,
        questions: g.questions.sort((a, b) => a.orderIndex - b.orderIndex),
      }),
    ),
  );

  function getStatus(q: QuestionFromAPI): "correct" | "wrong" | "skipped" {
    const ans = answerMap[q.id];
    if (!ans || !ans.answerText?.trim()) return "skipped";
    return ans.isCorrect ? "correct" : "wrong";
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Title */}
      <h1 className="text-2xl font-extrabold text-foreground mb-2">
        Results: {attempt.test.title}
      </h1>

      {/* Back button */}
      <button
        onClick={() => router.push(`/tests/${testId}`)}
        className="brutal-btn bg-white text-foreground px-5 py-2 text-sm flex items-center gap-2 mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Test
      </button>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Score info */}
        <div className="brutal-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              Result
            </span>
            <span className="font-extrabold text-foreground text-lg">
              {correct}/{total}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 flex items-center gap-1.5">
              <Target className="w-4 h-4" />
              Accuracy
            </span>
            <span className="font-extrabold text-foreground text-lg">{accuracyPct}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Time
            </span>
            <span className="font-extrabold text-foreground text-lg">{formatTime(timeSpent)}</span>
          </div>
        </div>

        {/* Correct */}
        <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2 border-2 border-emerald-300">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <span className="text-emerald-600 font-semibold text-sm">Correct</span>
          <span className="text-3xl font-extrabold text-foreground">{correct}</span>
        </div>

        {/* Wrong */}
        <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2 border-2 border-red-300">
            <XCircle className="w-6 h-6 text-red-500" />
          </div>
          <span className="text-red-500 font-semibold text-sm">Wrong</span>
          <span className="text-3xl font-extrabold text-foreground">{wrong}</span>
        </div>

        {/* Skipped */}
        <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2 border-2 border-slate-300">
            <MinusCircle className="w-6 h-6 text-slate-400" />
          </div>
          <span className="text-slate-500 font-semibold text-sm">Skipped</span>
          <span className="text-3xl font-extrabold text-foreground">{skipped}</span>
        </div>
      </div>

      {/* Analysis table */}
      <h2 className="text-lg font-extrabold text-foreground mb-3">Detailed Analysis</h2>
      <div className="brutal-card overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              <th className="text-left px-4 py-3 font-bold text-foreground w-48">Question Type</th>
              <th className="text-center px-3 py-3 font-bold text-foreground w-24">Correct</th>
              <th className="text-center px-3 py-3 font-bold text-foreground w-20">Wrong</th>
              <th className="text-center px-3 py-3 font-bold text-foreground w-24">Skipped</th>
              <th className="text-center px-3 py-3 font-bold text-foreground w-28">Accuracy</th>
              <th className="text-left px-3 py-3 font-bold text-foreground">Questions</th>
            </tr>
          </thead>
          <tbody>
            {analysisRows.map((row, idx) => {
              const stats = { correct: 0, wrong: 0, skipped: 0 };
              row.questions.forEach((q) => {
                stats[getStatus(q)]++;
              });
              const rowAnswered = stats.correct + stats.wrong;
              const acc = rowAnswered > 0 ? ((stats.correct / rowAnswered) * 100).toFixed(1) + "%" : "0.0%";

              return (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="px-4 py-3 text-foreground text-sm font-medium">{row.type}</td>
                  <td className="text-center px-3 py-3 text-emerald-600 font-semibold">{stats.correct}</td>
                  <td className="text-center px-3 py-3 text-red-500 font-semibold">{stats.wrong}</td>
                  <td className="text-center px-3 py-3 text-slate-400 font-semibold">{stats.skipped}</td>
                  <td className="text-center px-3 py-3 text-foreground font-semibold">{acc}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.questions.map((q) => (
                        <QuestionNumberBadge key={q.id} num={q.questionNumber} status={getStatus(q)} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            <tr className="bg-slate-50 font-bold">
              <td className="px-4 py-3 text-foreground">Total</td>
              <td className="text-center px-3 py-3 text-emerald-600">{correct}</td>
              <td className="text-center px-3 py-3 text-red-500">{wrong}</td>
              <td className="text-center px-3 py-3 text-slate-400">{skipped}</td>
              <td className="text-center px-3 py-3 text-foreground">{accuracyPct}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Answer Review */}
      <h2 className="text-lg font-extrabold text-foreground mb-4">Answer Key</h2>

      {sections.map((section) => (
        <div key={section.id} className="mb-6">
          <h4 className="font-bold text-foreground mb-3 text-sm">{section.title}</h4>
          <div className="sm:columns-2 gap-x-8 space-y-3">
            {section.questionGroups
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .flatMap((g) =>
                g.questions
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map((q) => ({ question: q, group: g })),
              )
              .map(({ question: q, group: g }) => {
                const ans = answerMap[q.id];
                const status = getStatus(q);
                const userAnswer = ans?.answerText || "";

                return (
                  <div key={q.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm break-inside-avoid">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-primary text-white font-bold text-xs shrink-0">
                      {q.questionNumber}
                    </span>
                    <span className="font-bold text-foreground">
                      {q.correctAnswer}:
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      {status === "skipped" ? (
                        <>
                          <span className="text-slate-400 italic">chưa trả lời</span>
                          <Minus className="w-4 h-4 text-slate-300 shrink-0" />
                        </>
                      ) : status === "correct" ? (
                        <>
                          <span className="text-emerald-600 font-medium">{userAnswer}</span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        </>
                      ) : (
                        <>
                          <span className="text-red-500 line-through">{userAnswer}</span>
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        </>
                      )}
                    </span>
                    <button
                      onClick={() => setSelectedQuestion({ question: q, group: g, section })}
                      className="text-primary hover:underline text-xs font-medium cursor-pointer whitespace-nowrap"
                    >
                      [Chi tiết]
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      ))}

      {/* Question Detail Modal */}
      {selectedQuestion && (
        <QuestionDetailModal
          open={!!selectedQuestion}
          onClose={() => setSelectedQuestion(null)}
          question={selectedQuestion.question}
          group={selectedQuestion.group}
          section={selectedQuestion.section}
          testTitle={attempt.test.title}
          userAnswer={answerMap[selectedQuestion.question.id]?.answerText || null}
          status={getStatus(selectedQuestion.question)}
        />
      )}
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading...</div>}>
      <ResultContent />
    </Suspense>
  );
}
