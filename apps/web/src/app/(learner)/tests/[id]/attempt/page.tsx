"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { App, Modal } from "antd";
import { X, Info, ChevronRight, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { LayoutRouter } from "@/components/attempt-layouts/layout-router";
import { QuestionNavigator } from "@/components/question-navigator";
import type { SectionFromAPI } from "@/components/attempt-layouts/types";

// ─── Types ──────────────────────────────────────────────
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

// ─── AttemptContent ──────────────────────────────────────
function AttemptContent() {
  const { message } = App.useApp();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = params.id as string;
  const attemptId = searchParams.get("attemptId");

  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const submittedRef = useRef(false);
  const answersRef = useRef<Record<string, string>>({});

  // Keep answersRef in sync for use in event handlers
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const resultUrl = `/tests/${testId}/result?attemptId=${attemptId}`;

  const { data: attempt, isLoading } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: async () => {
      if (!attemptId) throw new Error("No attemptId");
      const { data } = await api.get(`/attempts/${attemptId}`);
      return data as AttemptFromAPI;
    },
    enabled: !!attemptId,
  });

  // If attempt is already submitted (e.g. cron auto-submitted), redirect to result
  useEffect(() => {
    if (attempt?.status === "SUBMITTED") {
      router.replace(resultUrl);
    }
  }, [attempt, router, resultUrl]);

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

  useEffect(() => {
    if (!attempt) return;
    if (attempt.timeLimitMins) {
      const elapsed = Math.floor(
        (Date.now() - new Date(attempt.startedAt).getTime()) / 1000
      );
      const remaining = attempt.timeLimitMins * 60 - elapsed;
      setTimeLeft(Math.max(0, remaining));
    } else {
      setTimeLeft(null);
    }
  }, [attempt]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setInterval(
      () => setTimeLeft((t) => (t !== null ? Math.max(0, t - 1) : null)),
      1000
    );
    return () => clearInterval(id);
  }, [timeLeft]);

  // Auto-save answers every 5 seconds
  useEffect(() => {
    if (!attemptId) return;
    saveTimerRef.current = setInterval(() => {
      const current = JSON.stringify(answers);
      if (
        current !== lastSavedRef.current &&
        Object.keys(answers).length > 0
      ) {
        const answerList = Object.entries(answers).map(
          ([questionId, answerText]) => ({ questionId, answerText })
        );
        api
          .post(`/attempts/${attemptId}/answers/bulk`, { answers: answerList })
          .catch(() => {});
        lastSavedRef.current = current;
      }
    }, 5000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    };
  }, [attemptId, answers]);

  // Heartbeat every 30 seconds
  useEffect(() => {
    if (!attemptId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.post(`/attempts/${attemptId}/heartbeat`);
        if (data.alreadySubmitted) {
          submittedRef.current = true;
          router.replace(resultUrl);
        }
      } catch {
        // Ignore network errors — cron will handle it
      }
    }, 30_000);
    // Send initial heartbeat immediately
    api.post(`/attempts/${attemptId}/heartbeat`).catch(() => {});
    return () => clearInterval(interval);
  }, [attemptId, router, resultUrl]);

  // Auto-submit when timer reaches zero
  useEffect(() => {
    if (timeLeft === 0 && !submittedRef.current) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // beforeunload — show native "Leave site?" dialog + best-effort save answers
  useEffect(() => {
    if (!attemptId) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      // Show native browser confirmation dialog
      event.preventDefault();
      // Best-effort save answers via sendBeacon (runs if user confirms leaving)
      const currentAnswers = answersRef.current;
      const answerList = Object.entries(currentAnswers).map(
        ([questionId, answerText]) => ({ questionId, answerText })
      );
      if (answerList.length > 0) {
        const payload = JSON.stringify({ answers: answerList });
        navigator.sendBeacon(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"}/attempts/${attemptId}/answers/bulk`,
          new Blob([payload], { type: "application/json" })
        );
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [attemptId]);

  // visibilitychange — check if cron auto-submitted while tab was hidden
  useEffect(() => {
    if (!attemptId) return;
    const handler = async () => {
      if (document.visibilityState === "visible" && !submittedRef.current) {
        try {
          const { data } = await api.post(
            `/attempts/${attemptId}/heartbeat`
          );
          if (data.alreadySubmitted) {
            submittedRef.current = true;
            router.replace(resultUrl);
          }
        } catch {
          // Ignore
        }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [attemptId, router, resultUrl]);

  // popstate — intercept browser back/forward button with confirmation dialog
  useEffect(() => {
    if (!attemptId) return;
    // Push a dummy history entry so pressing back triggers popstate instead of leaving
    window.history.pushState(null, "", window.location.href);

    const handler = () => {
      if (submittedRef.current) return;
      // Re-push to prevent immediate navigation
      window.history.pushState(null, "", window.location.href);
      Modal.confirm({
        title: "Submit test?",
        content:
          "Leaving will submit your test with your current answers. This cannot be undone.",
        okText: "Submit & Leave",
        cancelText: "Stay",
        okButtonProps: { danger: true },
        onOk: () => handleSubmit(),
      });
    };

    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  const setAnswer = useCallback(
    (questionId: string, val: string) =>
      setAnswers((prev) => ({ ...prev, [questionId]: val })),
    []
  );

  const handleSubmit = async () => {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const answerList = Object.entries(answersRef.current).map(
        ([questionId, answerText]) => ({ questionId, answerText })
      );
      if (answerList.length > 0) {
        await api.post(`/attempts/${attemptId}/answers/bulk`, {
          answers: answerList,
        });
      }
      await api.post(`/attempts/${attemptId}/submit`);
      message.success("Submitted successfully!");
      router.push(resultUrl);
    } catch (err: any) {
      // If already submitted (idempotent), still navigate to result
      if (err.response?.status === 400 || err.response?.data?.alreadySubmitted) {
        router.push(resultUrl);
        return;
      }
      submittedRef.current = false;
      message.error(err.response?.data?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Exit now means submit-then-navigate
  const handleExit = async () => {
    await handleSubmit();
  };

  const handleQuestionClick = useCallback(
    (sectionIndex: number, questionId: string) => {
      setActiveSectionIndex(sectionIndex);
      // Scroll to question after section switch
      setTimeout(() => {
        const el = document.getElementById(`question-${questionId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    },
    []
  );

  if (isLoading || !attempt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-cream">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sections = attempt.sections
    .map((as) => as.section)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const activeSection = sections[activeSectionIndex];

  // Determine if we should show highlight toggle (only for PASSAGE_QUESTIONS)
  const showHighlight = activeSection?.skill === "READING" && (activeSection?.passages?.length ?? 0) > 0;

  // Build navigator data
  const navSections = sections.map((s) => ({
    id: s.id,
    title: s.title,
    questions: s.questionGroups
      .flatMap((g) => g.questions)
      .sort((a, b) => a.questionNumber - b.questionNumber),
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-cream"
      style={{ fontSize: 14 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-center border-b-2 border-border-strong bg-white shrink-0 h-12 relative">
        <span className="font-bold text-foreground text-sm">
          {attempt.test.title}
        </span>
        <button
          onClick={handleExit}
          className="absolute right-3 w-8 h-8 flex items-center justify-center rounded-lg border-2 border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden m-3 border-2 border-border-strong rounded-2xl bg-white">
        {/* Left main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar row: highlight toggle + section tabs */}
          <div className="flex items-center gap-4 px-5 py-2.5 border-b border-slate-200 bg-white shrink-0">
            {/* Highlight toggle (only for passage layouts) */}
            {showHighlight && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setHighlightEnabled((v) => !v)}
                  className={`relative inline-flex items-center rounded-full transition-colors shrink-0 cursor-pointer ${
                    highlightEnabled ? "bg-primary" : "bg-slate-300"
                  }`}
                  style={{ width: 36, height: 20 }}
                >
                  <span
                    className="inline-block rounded-full bg-white shadow transition-transform"
                    style={{
                      width: 16,
                      height: 16,
                      transform: highlightEnabled
                        ? "translateX(18px)"
                        : "translateX(2px)",
                    }}
                  />
                </button>
                <span className="text-slate-600 text-sm">Highlight</span>
                <span className="text-slate-400 cursor-help">
                  <Info className="w-3.5 h-3.5" />
                </span>
                <div className="w-px h-5 bg-slate-200 ml-2" />
              </div>
            )}

            {/* Section tabs */}
            <div className="flex items-center gap-2 flex-1 overflow-x-auto">
              {sections.map((section, idx) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSectionIndex(idx)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    idx === activeSectionIndex
                      ? "bg-primary text-white"
                      : "text-slate-500 hover:text-foreground hover:bg-slate-50"
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </div>
          </div>

          {/* Layout content — delegated to LayoutRouter */}
          <div className="flex flex-1 overflow-hidden">
            {activeSection && (
              <LayoutRouter
                section={activeSection}
                answers={answers}
                onAnswer={setAnswer}
                highlightEnabled={highlightEnabled}
              />
            )}
          </div>

          {/* Bottom nav */}
          <div className="flex justify-between px-5 py-2.5 border-t border-slate-200 bg-white shrink-0">
            {activeSectionIndex > 0 ? (
              <button
                onClick={() => setActiveSectionIndex((i) => i - 1)}
                className="text-primary font-bold hover:text-green-700 flex items-center gap-1 transition-colors cursor-pointer text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                PREV
              </button>
            ) : (
              <span />
            )}
            {activeSectionIndex < sections.length - 1 && (
              <button
                onClick={() => setActiveSectionIndex((i) => i + 1)}
                className="text-primary font-bold hover:text-green-700 flex items-center gap-1 transition-colors cursor-pointer text-sm"
              >
                NEXT
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Right sidebar — Question Navigator */}
        <QuestionNavigator
          sections={navSections}
          answers={answers}
          timeLeft={timeLeft}
          submitting={submitting}
          onSubmit={handleSubmit}
          onQuestionClick={handleQuestionClick}
          activeSectionIndex={activeSectionIndex}
        />
      </div>
    </div>
  );
}

export default function AttemptPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-slate-500">Loading...</div>
      }
    >
      <AttemptContent />
    </Suspense>
  );
}
