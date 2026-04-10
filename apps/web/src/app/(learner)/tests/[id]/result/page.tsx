"use client";

import { Suspense, useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  audioAnswerUrl: string | null;
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
  scaledScore: number | null;
  bandScore: number | null;
  sectionScores: Record<string, { correct: number; total: number; scaled: number; level?: number; reason?: string }> | null;
  test: { id: string; title: string; examType: string };
  sections: { sectionId: string; section: SectionFromAPI }[];
  answers: AnswerFromAPI[];
}

interface WritingEvaluation {
  id: string;
  overallScore: number;
  grammarScore: number;
  vocabScore: number;
  contentScore: number;
  feedback: string;
  grammarErrors?: Array<{ error: string; correction: string; explanation: string }> | null;
  answer: {
    id: string;
    questionId: string;
    answerText: string | null;
    question: { questionNumber: number; stem: string | null; group: { questionType: string } };
  };
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
    READ_ALOUD: "Read Aloud",
    DESCRIBE_PICTURE: "Describe a Picture",
    RESPOND_TO_QUESTIONS: "Respond to Questions",
    PROPOSE_SOLUTION: "Propose a Solution",
    EXPRESS_OPINION: "Express an Opinion",
    WRITE_SENTENCES: "Write Sentences",
    RESPOND_WRITTEN_REQUEST: "Respond to Written Request",
    WRITE_OPINION_ESSAY: "Opinion Essay",
    SENTENCE_REORDER: "Sentence Reorder",
    KEYWORD_COMPOSITION: "Keyword Composition",
    PICTURE_COMPOSITION: "Picture Composition",
  };
  return map[type] || type;
}

const SPEAKING_TYPES = new Set([
  "READ_ALOUD",
  "DESCRIBE_PICTURE",
  "RESPOND_TO_QUESTIONS",
  "PROPOSE_SOLUTION",
  "EXPRESS_OPINION",
]);

const WRITING_TYPES = new Set([
  "WRITE_SENTENCES",
  "RESPOND_WRITTEN_REQUEST",
  "WRITE_OPINION_ESSAY",
]);

interface SpeakingWordScore {
  word: string;
  targetWord: string;
  status: string;
  confidence: number;
  details?: string;
  pauseBefore: number;
}

interface SpeakingAssessmentData {
  transcript?: string;
  assessment?: {
    overallScore: number;
    pronunciationScore: number;
    fluencyScore: number;
    completenessScore: number;
    wordScores: SpeakingWordScore[];
    finalTranscript?: string;
    totalDuration?: number;
    pauseCount?: number;
    totalPauseTime?: number;
  };
}

function parseSpeakingAnswer(answerText: string | null): SpeakingAssessmentData | null {
  if (!answerText) return null;
  try {
    const parsed = JSON.parse(answerText);
    if (parsed.assessment || parsed.transcript) return parsed;
    return null;
  } catch {
    return null;
  }
}

function SpeakingResultCard({ data, audioUrl }: { data: SpeakingAssessmentData; audioUrl?: string | null }) {
  const a = data.assessment;
  if (!a) {
    return (
      <div className="text-sm text-slate-500 italic">
        {data.transcript ? `Transcript: "${data.transcript}"` : "No assessment data"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Audio playback */}
      {audioUrl && <AudioPlayer src={audioUrl} />}

      {/* Scores */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{a.overallScore}</div>
          <div className="text-xs text-slate-500">Overall</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold">{a.pronunciationScore}</div>
          <div className="text-xs text-slate-500">Pronunciation</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold">{a.fluencyScore}</div>
          <div className="text-xs text-slate-500">Fluency</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold">{a.completenessScore}</div>
          <div className="text-xs text-slate-500">Completeness</div>
        </div>
      </div>

      {/* Word scores */}
      {a.wordScores && a.wordScores.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {a.wordScores.map((ws, i) => (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded text-sm font-medium ${
                ws.status === "correct"
                  ? "bg-green-100 text-green-800"
                  : ws.status === "warning"
                    ? "bg-yellow-100 text-yellow-800"
                    : ws.status === "incorrect"
                      ? "bg-red-100 text-red-800"
                      : ws.status === "missing"
                        ? "bg-gray-100 text-gray-500 line-through"
                        : "bg-purple-100 text-purple-800"
              }`}
              title={ws.details || ws.status}
            >
              {ws.targetWord || ws.word || "?"}
            </span>
          ))}
        </div>
      )}

      {/* Transcript */}
      {a.finalTranscript && (
        <div className="text-sm text-slate-600">
          <span className="font-medium text-slate-500">Transcript:</span>{" "}
          <em>&quot;{a.finalTranscript}&quot;</em>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────
function QuestionNumberBadge({
  num,
  status,
}: {
  num: number;
  status: "correct" | "wrong" | "skipped" | "speaking" | "writing";
}) {
  const styles: Record<string, string> = {
    correct: "border-2 border-emerald-400 text-emerald-600 bg-emerald-50",
    wrong: "border-2 border-red-300 text-red-500 bg-red-50",
    skipped: "border-2 border-slate-200 text-slate-400 bg-white",
    speaking: "border-2 border-blue-300 text-blue-600 bg-blue-50",
    writing: "border-2 border-blue-300 text-blue-600 bg-blue-50",
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
  audioAnswerUrl: string | null;
  status: "correct" | "wrong" | "skipped" | "speaking" | "writing";
}

function QuestionDetailModal({
  open,
  onClose,
  question,
  group,
  section,
  testTitle,
  userAnswer,
  audioAnswerUrl,
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
        {status !== "speaking" && options.length === 0 && question.stem && (
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

        {/* Speaking assessment result */}
        {status === "speaking" && (() => {
          const speakingData = parseSpeakingAnswer(userAnswer);
          if (!speakingData) return <div className="text-sm text-slate-400 italic">No speaking data</div>;
          return <SpeakingResultCard data={speakingData} audioUrl={audioAnswerUrl} />;
        })()}

        {/* Correct answer display (non-speaking) */}
        {status !== "speaking" && (
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
        )}

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

  const queryClient = useQueryClient();
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
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const isSW = data.test?.examType === "TOEIC_SW" || data.test?.examType === "TOEIC_SPEAKING" || data.test?.examType === "TOEIC_WRITING";
      // Keep polling until scores are calculated (backend recalculates when AI grading completes)
      if (isSW && (data.scaledScore === 0 || data.scaledScore === null)) {
        return 5000;
      }
      return false;
    },
  });

  const isToeicSW = attempt?.test?.examType === "TOEIC_SW" || attempt?.test?.examType === "TOEIC_SPEAKING" || attempt?.test?.examType === "TOEIC_WRITING";

  // Poll writing evaluations for TOEIC_SW
  const { data: writingEvalsResponse } = useQuery({
    queryKey: ["toeic-sw-evaluations", attemptId],
    queryFn: async () => {
      const { data } = await api.get(
        `/toeic-sw-grading/evaluations/${attemptId}`,
      );
      return data as { evaluations: WritingEvaluation[]; totalExpected: number; allDone: boolean };
    },
    enabled: !!attemptId && isToeicSW,
    refetchInterval: (query) => {
      const resp = query.state.data;
      if (!resp) return 5000;
      return resp.allDone ? false : 5000;
    },
  });
  const writingEvals = writingEvalsResponse?.evaluations;

  // When all writing evaluations are done, refetch the result to get updated scaledScore
  const allEvalsDone = writingEvalsResponse?.allDone ?? false;
  useEffect(() => {
    if (allEvalsDone) {
      queryClient.invalidateQueries({ queryKey: ["result", attemptId] });
    }
  }, [allEvalsDone, attemptId, queryClient]);

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

  // Separate writing questions from non-writing for stats
  const allQuestionIds = new Set<string>();
  const writingQuestionIds = new Set<string>();
  sections.forEach((s) =>
    s.questionGroups.forEach((g) =>
      g.questions.forEach((q) => {
        allQuestionIds.add(q.id);
        if (WRITING_TYPES.has(g.questionType)) writingQuestionIds.add(q.id);
      }),
    ),
  );

  const nonWritingAnswers = attempt.answers.filter(
    (a) => !writingQuestionIds.has(a.questionId),
  );
  const nonWritingTotal = allQuestionIds.size - writingQuestionIds.size;
  const hasWritingOnly = nonWritingTotal === 0;

  const correct = hasWritingOnly ? 0 : nonWritingAnswers.filter((a) => a.isCorrect).length;
  const answered = hasWritingOnly ? 0 : nonWritingAnswers.filter((a) => a.answerText?.trim()).length;
  const total = nonWritingTotal;
  const wrong = answered - correct;
  const skipped = total - answered;

  const timeSpent = attempt.submittedAt
    ? Math.floor(
        (new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000,
      )
    : 0;

  const accuracyPct =
    answered > 0 ? ((correct / answered) * 100).toFixed(1) + "%" : "0.0%";

  // Writing average score
  const writingAvgScore =
    writingEvals && writingEvals.length > 0
      ? Math.round(
          writingEvals
            .filter((e) => e.overallScore >= 0)
            .reduce((sum, e) => sum + e.overallScore, 0) /
            Math.max(writingEvals.filter((e) => e.overallScore >= 0).length, 1),
        )
      : null;
  const writingGradingDone = allEvalsDone;

  interface AnalysisRow {
    sectionTitle: string;
    type: string;
    questions: QuestionFromAPI[];
  }
  // Build question -> questionType map
  const questionTypeMap: Record<string, string> = {};
  sections.forEach((s) =>
    s.questionGroups.forEach((g) =>
      g.questions.forEach((q) => {
        questionTypeMap[q.id] = g.questionType;
      }),
    ),
  );

  const analysisRows: AnalysisRow[] = [];
  sections.forEach((s) =>
    s.questionGroups.forEach((g) =>
      analysisRows.push({
        sectionTitle: s.title,
        type: `[${s.skill === "LISTENING" ? "Listening" : s.skill === "SPEAKING" ? "Speaking" : s.skill === "WRITING" ? "Writing" : "Reading"}] ${getQuestionTypeLabel(g.questionType)}`,
        questions: g.questions.sort((a, b) => a.orderIndex - b.orderIndex),
      }),
    ),
  );

  function isSpeakingQuestion(questionId: string): boolean {
    return SPEAKING_TYPES.has(questionTypeMap[questionId] || "");
  }

  function isWritingQuestion(questionId: string): boolean {
    return WRITING_TYPES.has(questionTypeMap[questionId] || "");
  }

  // Build writing evaluation lookup by questionId
  const writingEvalMap: Record<string, WritingEvaluation> = {};
  if (writingEvals) {
    writingEvals.forEach((ev) => {
      writingEvalMap[ev.answer.questionId] = ev;
    });
  }

  function getStatus(q: QuestionFromAPI): "correct" | "wrong" | "skipped" | "speaking" | "writing" {
    const ans = answerMap[q.id];
    if (!ans || !ans.answerText?.trim()) return "skipped";
    if (isSpeakingQuestion(q.id)) return "speaking";
    if (isWritingQuestion(q.id)) return "writing";
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

      {/* TOEIC_SW Score Banner */}
      {isToeicSW && attempt.sectionScores && (() => {
        const speakingData = attempt.sectionScores.speaking;
        const writingData = attempt.sectionScores.writing;
        const hasSpeaking = !!speakingData;
        const hasWriting = !!writingData;
        const isCombined = hasSpeaking && hasWriting;
        const bannerTitle = isCombined
          ? "TOEIC Speaking & Writing Scores"
          : hasSpeaking
            ? "TOEIC Speaking Score"
            : "TOEIC Writing Score";

        const levelColorClass = (level?: number) => {
          if (!level) return "bg-slate-100 text-slate-600 border-slate-300";
          if (level >= 8) return "bg-emerald-100 text-emerald-700 border-emerald-400";
          if (level >= 6) return "bg-blue-100 text-blue-700 border-blue-400";
          if (level >= 4) return "bg-amber-100 text-amber-700 border-amber-400";
          return "bg-red-100 text-red-600 border-red-300";
        };

        const levelLabel = (level?: number) => {
          if (!level) return "";
          if (level >= 8) return "Advanced";
          if (level >= 6) return "Upper Intermediate";
          if (level >= 4) return "Intermediate";
          if (level >= 2) return "Basic";
          return "Below Basic";
        };

        return (
          <div className="brutal-card p-6 mb-6 bg-gradient-to-r from-blue-50 to-amber-50">
            <h2 className="text-lg font-extrabold text-foreground mb-4">
              {bannerTitle}
            </h2>
            <div className="flex items-center gap-6 flex-wrap">
              {hasSpeaking && (
                <div className="text-center min-w-[120px]">
                  <div className="text-4xl font-extrabold text-blue-600">
                    {speakingData.scaled}
                  </div>
                  <div className="text-sm text-slate-500 font-semibold mb-1">
                    Speaking (0-200)
                  </div>
                  {speakingData.level != null && (
                    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded border ${levelColorClass(speakingData.level)}`}>
                      Level {speakingData.level} &middot; {levelLabel(speakingData.level)}
                    </span>
                  )}
                </div>
              )}
              {hasWriting && (
                <div className="text-center min-w-[120px]">
                  <div className="text-4xl font-extrabold text-emerald-600">
                    {writingData.scaled}
                  </div>
                  <div className="text-sm text-slate-500 font-semibold mb-1">
                    Writing (0-200)
                  </div>
                  {writingData.level != null && (
                    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded border ${levelColorClass(writingData.level)}`}>
                      Level {writingData.level} &middot; {levelLabel(writingData.level)}
                    </span>
                  )}
                </div>
              )}
              {isCombined && attempt.scaledScore != null && (
                <div className="text-center border-l-2 border-slate-300 pl-6">
                  <div className="text-5xl font-extrabold text-foreground">
                    {attempt.scaledScore}
                  </div>
                  <div className="text-sm text-slate-500 font-semibold">
                    Total (0-400)
                  </div>
                </div>
              )}
            </div>
            {/* Level scale reference */}
            {(speakingData?.level != null || writingData?.level != null) && (
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-slate-400 font-semibold mr-2">Levels:</span>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => {
                    const isActive =
                      (speakingData?.level === lvl) || (writingData?.level === lvl);
                    return (
                      <span
                        key={lvl}
                        className={`w-7 h-7 flex items-center justify-center text-xs font-bold rounded border-2 transition-all ${
                          isActive
                            ? "bg-foreground text-white border-foreground scale-110"
                            : "bg-white text-slate-400 border-slate-200"
                        }`}
                      >
                        {lvl}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}


      {/* Summary cards */}
      {hasWritingOnly ? (
        /* Writing-only test: show AI score summary */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
            {!writingGradingDone ? (
              <>
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-2 border-2 border-amber-300 animate-pulse">
                  <Target className="w-6 h-6 text-amber-600" />
                </div>
                <span className="text-amber-600 font-semibold text-sm">AI Grading</span>
                <span className="text-lg font-extrabold text-foreground animate-pulse">In Progress...</span>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-2 border-2 border-blue-300">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-blue-600 font-semibold text-sm">Average Score</span>
                <span className={`text-3xl font-extrabold ${
                  (writingAvgScore ?? 0) >= 70 ? "text-emerald-600" : (writingAvgScore ?? 0) >= 50 ? "text-amber-600" : "text-red-500"
                }`}>{writingAvgScore}/100</span>
              </>
            )}
          </div>

          <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2 border-2 border-emerald-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-emerald-600 font-semibold text-sm">Answered</span>
            <span className="text-3xl font-extrabold text-foreground">
              {attempt.answers.filter((a) => a.answerText?.trim()).length}/{writingQuestionIds.size}
            </span>
          </div>

          <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2 border-2 border-slate-300">
              <Clock className="w-6 h-6 text-slate-500" />
            </div>
            <span className="text-slate-500 font-semibold text-sm">Time</span>
            <span className="text-3xl font-extrabold text-foreground">{formatTime(timeSpent)}</span>
          </div>
        </div>
      ) : (
        /* Non-writing tests: standard correct/wrong/skipped cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

          <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2 border-2 border-emerald-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-emerald-600 font-semibold text-sm">Correct</span>
            <span className="text-3xl font-extrabold text-foreground">{correct}</span>
          </div>

          <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2 border-2 border-red-300">
              <XCircle className="w-6 h-6 text-red-500" />
            </div>
            <span className="text-red-500 font-semibold text-sm">Wrong</span>
            <span className="text-3xl font-extrabold text-foreground">{wrong}</span>
          </div>

          <div className="brutal-card p-5 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2 border-2 border-slate-300">
              <MinusCircle className="w-6 h-6 text-slate-400" />
            </div>
            <span className="text-slate-500 font-semibold text-sm">Skipped</span>
            <span className="text-3xl font-extrabold text-foreground">{skipped}</span>
          </div>
        </div>
      )}

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
              const stats = { correct: 0, wrong: 0, skipped: 0, speaking: 0, writing: 0 };
              row.questions.forEach((q) => {
                stats[getStatus(q)]++;
              });
              const isAiGraded = stats.speaking > 0 || stats.writing > 0;
              const rowAnswered = stats.correct + stats.wrong;

              let acc: string;
              if (stats.writing > 0) {
                // Show average AI score for writing questions
                const rowEvals = row.questions
                  .map((q) => writingEvalMap[q.id])
                  .filter((e) => e && e.overallScore >= 0);
                if (rowEvals.length > 0) {
                  const avg = Math.round(rowEvals.reduce((s, e) => s + e.overallScore, 0) / rowEvals.length);
                  acc = `Avg: ${avg}/100`;
                } else {
                  acc = "Grading...";
                }
              } else if (stats.speaking > 0) {
                acc = "AI Graded";
              } else {
                acc = rowAnswered > 0 ? ((stats.correct / rowAnswered) * 100).toFixed(1) + "%" : "0.0%";
              }

              return (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="px-4 py-3 text-foreground text-sm font-medium">{row.type}</td>
                  {isAiGraded ? (
                    <td colSpan={3} className="text-center px-3 py-3 text-blue-600 font-semibold text-sm">
                      AI Graded
                    </td>
                  ) : (
                    <>
                      <td className="text-center px-3 py-3 text-emerald-600 font-semibold">{stats.correct}</td>
                      <td className="text-center px-3 py-3 text-red-500 font-semibold">{stats.wrong}</td>
                      <td className="text-center px-3 py-3 text-slate-400 font-semibold">{stats.skipped}</td>
                    </>
                  )}
                  <td className="text-center px-3 py-3 text-foreground font-semibold">{acc}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.questions.map((q) => {
                        const s = getStatus(q);
                        if (s === "writing") {
                          const ev = writingEvalMap[q.id];
                          const wStatus = !ev ? "skipped" : ev.overallScore === -1 ? "skipped" : ev.overallScore >= 60 ? "correct" : "wrong";
                          return <QuestionNumberBadge key={q.id} num={q.questionNumber} status={wStatus} />;
                        }
                        return <QuestionNumberBadge key={q.id} num={q.questionNumber} status={s} />;
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            <tr className="bg-slate-50 font-bold">
              <td className="px-4 py-3 text-foreground">Total</td>
              {hasWritingOnly ? (
                <td colSpan={3} className="text-center px-3 py-3 text-blue-600 text-sm">
                  AI Graded
                </td>
              ) : (
                <>
                  <td className="text-center px-3 py-3 text-emerald-600">{correct}</td>
                  <td className="text-center px-3 py-3 text-red-500">{wrong}</td>
                  <td className="text-center px-3 py-3 text-slate-400">{skipped}</td>
                </>
              )}
              <td className="text-center px-3 py-3 text-foreground">
                {hasWritingOnly
                  ? writingAvgScore != null ? `Avg: ${writingAvgScore}/100` : "Grading..."
                  : accuracyPct}
              </td>
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
          <div className="space-y-3">
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
                const speakingData = status === "speaking" ? parseSpeakingAnswer(userAnswer) : null;

                // Speaking question: render full card
                if (speakingData) {
                  return (
                    <div key={q.id} className="brutal-card p-4 break-inside-avoid">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-500 text-white font-bold text-xs shrink-0">
                          {q.questionNumber}
                        </span>
                        <span className="text-sm font-semibold text-slate-700">
                          {getQuestionTypeLabel(g.questionType)}
                        </span>
                      </div>
                      {q.stem && (
                        <div className="text-sm text-slate-600 mb-3 border-l-2 border-slate-200 pl-3" dangerouslySetInnerHTML={{ __html: q.stem }} />
                      )}
                      <SpeakingResultCard data={speakingData} audioUrl={ans?.audioAnswerUrl} />
                    </div>
                  );
                }

                // Writing question: show answer text with AI score
                if (status === "writing") {
                  const ev = writingEvalMap[q.id];
                  return (
                    <div key={q.id} className="brutal-card p-4 break-inside-avoid">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-500 text-white font-bold text-xs shrink-0">
                            {q.questionNumber}
                          </span>
                          <span className="text-sm font-semibold text-slate-700">
                            {getQuestionTypeLabel(g.questionType)}
                          </span>
                        </div>
                        {ev && ev.overallScore >= 0 ? (
                          <span className={`text-xl font-extrabold ${
                            ev.overallScore >= 70 ? "text-emerald-600" : ev.overallScore >= 50 ? "text-amber-600" : "text-red-500"
                          }`}>
                            {ev.overallScore}/100
                          </span>
                        ) : ev ? (
                          <span className="text-sm text-amber-600 font-medium animate-pulse">Grading...</span>
                        ) : null}
                      </div>
                      {userAnswer ? (
                        <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-200 mb-2">
                          {userAnswer}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400 italic mb-2">chưa trả lời</div>
                      )}
                      {ev && ev.overallScore >= 0 && (
                        <>
                          <div className="flex gap-4 text-xs mb-2">
                            <span>Grammar: <strong>{ev.grammarScore}</strong></span>
                            <span>Vocab: <strong>{ev.vocabScore}</strong></span>
                            <span>Content: <strong>{ev.contentScore}</strong></span>
                          </div>
                          {ev.feedback && (
                            <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 border border-slate-100"
                              dangerouslySetInnerHTML={{ __html: ev.feedback }}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                }

                // Non-speaking, non-writing question: compact row
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
          audioAnswerUrl={answerMap[selectedQuestion.question.id]?.audioAnswerUrl || null}
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
