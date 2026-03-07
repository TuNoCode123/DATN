"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Spin, message } from "antd";
import { api } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────
interface McqOption {
  label: string;
  text: string;
}
interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  mcqOptions: McqOption[] | null;
}
interface QuestionGroupFromAPI {
  id: string;
  questionType: string;
  orderIndex: number;
  contentHtml: string | null;
  matchingOptions: any;
  questions: QuestionFromAPI[];
}
interface SectionFromAPI {
  id: string;
  title: string;
  skill: string;
  orderIndex: number;
  questionCount: number;
  questionGroups: QuestionGroupFromAPI[];
}
interface AttemptFromAPI {
  id: string;
  mode: string;
  status: string;
  timeLimitMins: number | null;
  startedAt: string;
  test: { id: string; title: string; durationMins: number };
  sections: { sectionId: string; section: SectionFromAPI }[];
  answers: { questionId: string; answerText: string | null }[];
}

// ─── SVG Icons ───────────────────────────────────────────
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5,3 19,12 5,21" />
  </svg>
);
const VolumeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);
const GearIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

// ─── AttemptContent ──────────────────────────────────────
function AttemptContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = params.id as string;
  const attemptId = searchParams.get("attemptId");

  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  // answers keyed by questionId
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  // Fetch attempt data
  const { data: attempt, isLoading } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: async () => {
      if (!attemptId) throw new Error("No attemptId");
      const { data } = await api.get(`/attempts/${attemptId}`);
      return data as AttemptFromAPI;
    },
    enabled: !!attemptId,
  });

  // Initialize answers from existing saved answers
  useEffect(() => {
    if (attempt?.answers) {
      const existing: Record<string, string> = {};
      for (const a of attempt.answers) {
        if (a.answerText) existing[a.questionId] = a.answerText;
      }
      setAnswers(existing);
      lastSavedRef.current = JSON.stringify(existing);
    }
  }, [attempt]);

  // Initialize timer
  useEffect(() => {
    if (!attempt) return;
    if (attempt.timeLimitMins) {
      const elapsed = Math.floor(
        (Date.now() - new Date(attempt.startedAt).getTime()) / 1000
      );
      const remaining = attempt.timeLimitMins * 60 - elapsed;
      setTimeLeft(Math.max(0, remaining));
    } else {
      setTimeLeft(null); // no time limit
    }
  }, [attempt]);

  // Countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((t) => (t !== null ? Math.max(0, t - 1) : null)), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  // Auto-save answers every 5 seconds
  useEffect(() => {
    if (!attemptId) return;
    saveTimerRef.current = setInterval(() => {
      const current = JSON.stringify(answers);
      if (current !== lastSavedRef.current && Object.keys(answers).length > 0) {
        const answerList = Object.entries(answers).map(([questionId, answerText]) => ({
          questionId,
          answerText,
        }));
        api.post(`/attempts/${attemptId}/answers/bulk`, { answers: answerList }).catch(() => {});
        lastSavedRef.current = current;
      }
    }, 5000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    };
  }, [attemptId, answers]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const setAnswer = useCallback(
    (questionId: string, val: string) =>
      setAnswers((prev) => ({ ...prev, [questionId]: val })),
    [],
  );

  const handleSubmit = async () => {
    if (!attemptId) return;
    setSubmitting(true);
    try {
      // Save all answers first
      const answerList = Object.entries(answers).map(([questionId, answerText]) => ({
        questionId,
        answerText,
      }));
      if (answerList.length > 0) {
        await api.post(`/attempts/${attemptId}/answers/bulk`, { answers: answerList });
      }
      // Submit
      await api.post(`/attempts/${attemptId}/submit`);
      message.success("Nộp bài thành công!");
      router.push(`/tests/${testId}/result?attemptId=${attemptId}`);
    } catch (err: any) {
      message.error(err.response?.data?.message || "Nộp bài thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExit = async () => {
    // Save before exit
    if (attemptId && Object.keys(answers).length > 0) {
      const answerList = Object.entries(answers).map(([questionId, answerText]) => ({
        questionId,
        answerText,
      }));
      await api.post(`/attempts/${attemptId}/answers/bulk`, { answers: answerList }).catch(() => {});
    }
    router.back();
  };

  if (isLoading || !attempt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <Spin size="large" />
      </div>
    );
  }

  const sections = attempt.sections
    .map((as) => as.section)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const activeSection = sections[activeSectionIndex];
  const allQuestions = sections.flatMap((s) =>
    s.questionGroups.flatMap((g) => g.questions),
  );

  // Build a questionId→questionNumber map for the palette
  const qIdToNum: Record<string, number> = {};
  allQuestions.forEach((q) => {
    qIdToNum[q.id] = q.questionNumber;
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ fontSize: 13 }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-center border-b border-gray-200 bg-white shrink-0 relative"
        style={{ height: 44 }}
      >
        <span className="font-semibold text-gray-800" style={{ fontSize: 14 }}>
          {attempt.test.title}
        </span>
        <button
          onClick={handleExit}
          className="absolute right-4 px-3 py-1 border border-gray-400 rounded text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          style={{ fontSize: 13 }}
        >
          Thoát
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden m-2 border border-gray-300 rounded">
        {/* Left main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Highlight toggle */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
            <button
              onClick={() => setHighlightEnabled((v) => !v)}
              className={`relative inline-flex items-center rounded-full transition-colors shrink-0 ${highlightEnabled ? "bg-blue-600" : "bg-gray-300"}`}
              style={{ width: 36, height: 20 }}
            >
              <span
                className="inline-block rounded-full bg-white shadow transition-transform"
                style={{
                  width: 16,
                  height: 16,
                  transform: highlightEnabled ? "translateX(18px)" : "translateX(2px)",
                }}
              />
            </button>
            <span className="text-gray-700" style={{ fontSize: 13 }}>
              Highlight nội dung
            </span>
            <span className="text-gray-400 cursor-help">
              <InfoIcon />
            </span>
          </div>

          {/* Section tabs */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
            {sections.map((section, idx) => (
              <button
                key={section.id}
                onClick={() => setActiveSectionIndex(idx)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  idx === activeSectionIndex
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:text-gray-800"
                }`}
                style={{ fontSize: 13 }}
              >
                {section.title}
              </button>
            ))}
          </div>

          {/* Audio player */}
          <div
            className="flex items-center gap-3 px-4 border-b border-gray-200 bg-white shrink-0"
            style={{ height: 44 }}
          >
            <button className="text-gray-700 hover:text-blue-600 flex items-center justify-center">
              <PlayIcon />
            </button>
            <div className="flex-1 flex items-center gap-2" style={{ minWidth: 0 }}>
              <div className="relative flex-1 cursor-pointer" style={{ height: 4 }}>
                <div className="absolute inset-0 rounded-full bg-gray-200" />
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-gray-500"
                  style={{ width: "2%" }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gray-500 border-2 border-white shadow"
                  style={{ left: "2%" }}
                />
              </div>
            </div>
            <span className="text-gray-500 tabular-nums shrink-0" style={{ fontSize: 12 }}>
              00:00
            </span>
            <span className="text-gray-600 flex items-center">
              <VolumeIcon />
            </span>
            <div className="relative cursor-pointer shrink-0" style={{ width: 64, height: 4 }}>
              <div className="absolute inset-0 rounded-full bg-gray-200" />
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-blue-400"
                style={{ width: "75%" }}
              />
            </div>
            <span className="text-gray-400 cursor-pointer flex items-center hover:text-gray-600">
              <GearIcon />
            </span>
          </div>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden p-2">
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {activeSection?.questionGroups
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((group, gi) => {
                  const isMcq = group.questionType === "MULTIPLE_CHOICE";

                  return (
                    <div key={group.id}>
                      {gi > 0 && <hr className="border-gray-200" />}

                      {isMcq ? (
                        <div className="px-6 py-5">
                          <div
                            className="mb-4 text-gray-700 italic"
                            style={{ fontSize: 13, lineHeight: 1.6 }}
                          >
                            Choose the correct letter, <strong>A, B or C</strong>.
                          </div>
                          {group.questions
                            .sort((a, b) => a.orderIndex - b.orderIndex)
                            .map((q) => (
                              <div key={q.id} className="mb-5">
                                <div className="flex gap-2 mb-2">
                                  <span
                                    className="inline-flex items-center justify-center rounded-full bg-orange-100 text-orange-600 font-bold shrink-0"
                                    style={{ width: 26, height: 26, fontSize: 12 }}
                                  >
                                    {q.questionNumber}
                                  </span>
                                  <span className="font-medium text-gray-800" style={{ fontSize: 13 }}>
                                    {q.stem}
                                  </span>
                                </div>
                                <div className="ml-9 flex flex-col gap-1">
                                  {(q.mcqOptions || []).map((opt: McqOption) => (
                                    <label key={opt.label} className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`q${q.id}`}
                                        value={opt.label}
                                        checked={answers[q.id] === opt.label}
                                        onChange={() => setAnswer(q.id, opt.label)}
                                        className="accent-blue-600"
                                      />
                                      <span style={{ fontSize: 13 }}>
                                        {opt.label}. {opt.text}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="flex" style={{ width: "100%" }}>
                          <div className="px-6 py-5 overflow-x-hidden" style={{ width: "60%", minWidth: 0 }}>
                            <div
                              className="mb-3 text-gray-700 italic"
                              style={{ fontSize: 13, lineHeight: 1.6 }}
                            >
                              {group.questionType === "NOTE_FORM_COMPLETION" && (
                                <>Complete the form below. Write <strong>NO MORE THAN TWO WORDS AND/OR A NUMBER</strong> for each answer.</>
                              )}
                              {group.questionType === "TABLE_COMPLETION" && (
                                <>Complete the table below. Write <strong>NO MORE THAN ONE WORD AND/OR A NUMBER</strong> for each answer.</>
                              )}
                              {group.questionType === "SUMMARY_COMPLETION" && (
                                <>Complete the summary below. Write <strong>NO MORE THAN TWO WORDS</strong> for each answer.</>
                              )}
                              {group.questionType === "MATCHING" && (
                                <>Match each statement with the correct option.</>
                              )}
                            </div>
                            {group.contentHtml && (
                              <div
                                className="text-gray-800"
                                style={{ fontSize: 13, lineHeight: 1.7 }}
                                dangerouslySetInnerHTML={{ __html: group.contentHtml }}
                              />
                            )}
                          </div>
                          <div
                            className="border-gray-200 bg-white px-3 py-5 flex flex-col"
                            style={{ width: "40%", gap: 18 }}
                          >
                            {group.questions
                              .sort((a, b) => a.orderIndex - b.orderIndex)
                              .map((q) => (
                                <div key={q.id} className="flex items-center gap-2 max-w-[200px]">
                                  <span
                                    className="inline-flex items-center justify-center rounded-full shrink-0 font-semibold"
                                    style={{
                                      width: 26,
                                      height: 26,
                                      fontSize: 12,
                                      background: "#e8eef7",
                                      color: "#4a6fa5",
                                      border: "1px solid #b8cce4",
                                    }}
                                  >
                                    {q.questionNumber}
                                  </span>
                                  <input
                                    type="text"
                                    value={answers[q.id] || ""}
                                    onChange={(e) => setAnswer(q.id, e.target.value)}
                                    className="border border-gray-300 rounded bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 min-w-0"
                                    style={{ flex: 1, height: 30, padding: "0 8px", fontSize: 13 }}
                                  />
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Bottom nav */}
          <div className="flex justify-end px-4 py-2 border-t border-gray-200 bg-white shrink-0">
            {activeSectionIndex < sections.length - 1 && (
              <button
                onClick={() => setActiveSectionIndex((i) => i + 1)}
                className="text-blue-600 font-semibold hover:text-blue-800 flex items-center gap-1 transition-colors"
                style={{ fontSize: 13 }}
              >
                TIẾP THEO
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col bg-white shrink-0 border-l border-gray-200" style={{ width: 195 }}>
          {/* Timer */}
          <div className="px-4 pt-4 pb-3">
            <div className="text-gray-500 mb-1" style={{ fontSize: 12 }}>
              {timeLeft !== null ? "Thời gian còn lại:" : "Không giới hạn"}
            </div>
            {timeLeft !== null && (
              <div
                className="font-bold text-gray-900 tabular-nums"
                style={{ fontSize: 28, letterSpacing: 0.5 }}
              >
                {formatTime(timeLeft)}
              </div>
            )}
          </div>

          {/* Submit button */}
          <div className="px-4 pb-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full font-bold tracking-widest border-2 border-gray-700 rounded bg-white text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
              style={{ height: 36, fontSize: 13 }}
            >
              {submitting ? "..." : "NỘP BÀI"}
            </button>
          </div>

          {/* Note */}
          <div className="px-4 pb-3 border-b border-gray-200">
            <p className="text-red-500 italic leading-snug" style={{ fontSize: 11 }}>
              Chú ý: bạn có thể click vào số thứ tự câu hỏi trong bài để đánh dấu review
            </p>
          </div>

          {/* Question palette */}
          <div className="px-4 py-3 flex-1 overflow-y-auto">
            {sections.map((section) => {
              const qs = section.questionGroups.flatMap((g) => g.questions);
              return (
                <div key={section.id} className="mb-4">
                  <div className="font-bold text-gray-800 mb-2" style={{ fontSize: 12 }}>
                    {section.title}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {qs.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => setActiveSectionIndex(sections.indexOf(section))}
                        className={`rounded border text-center transition-colors tabular-nums ${
                          answers[q.id]?.trim()
                            ? "bg-green-500 text-white border-green-500"
                            : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                        }`}
                        style={{ width: 26, height: 26, fontSize: 11, lineHeight: "26px" }}
                      >
                        {q.questionNumber}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AttemptPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Đang tải...</div>}>
      <AttemptContent />
    </Suspense>
  );
}
