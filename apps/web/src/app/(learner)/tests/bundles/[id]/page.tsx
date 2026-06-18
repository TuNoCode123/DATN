"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Clock,
  Users,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Play,
  ChevronDown,
  ChevronUp,
  Trophy,
  ListChecks,
} from "lucide-react";

// ─── IELTS Band Score Tables ────────────────────────────────────────────────

// Listening: raw score → band (out of 40)
const LISTENING_BANDS: [number, number][] = [
  [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0],
  [26, 6.5], [23, 6.0], [18, 5.5], [16, 5.0], [13, 4.5],
  [10, 4.0], [7, 3.5], [5, 3.0], [3, 2.5], [1, 2.0],
];

// Reading Academic: raw score → band (out of 40)
const READING_BANDS: [number, number][] = [
  [39, 9.0], [37, 8.5], [35, 8.0], [33, 7.5], [30, 7.0],
  [27, 6.5], [23, 6.0], [19, 5.5], [15, 5.0], [13, 4.5],
  [10, 4.0], [8, 3.5], [6, 3.0], [4, 2.5], [3, 2.0],
];

function rawToBand(score: number, table: [number, number][]): number {
  for (const [min, band] of table) {
    if (score >= min) return band;
  }
  return 1.0;
}

function bandColor(band: number): string {
  if (band >= 8) return "text-emerald-600 bg-emerald-50 border-emerald-300";
  if (band >= 7) return "text-blue-600 bg-blue-50 border-blue-300";
  if (band >= 6) return "text-indigo-600 bg-indigo-50 border-indigo-300";
  if (band >= 5) return "text-amber-600 bg-amber-50 border-amber-300";
  return "text-red-600 bg-red-50 border-red-300";
}

// Score table rows: min correct → band
const LISTENING_ROWS = [
  { correct: "39–40", band: 9.0 }, { correct: "37–38", band: 8.5 },
  { correct: "35–36", band: 8.0 }, { correct: "32–34", band: 7.5 },
  { correct: "30–31", band: 7.0 }, { correct: "26–29", band: 6.5 },
  { correct: "23–25", band: 6.0 }, { correct: "18–22", band: 5.5 },
  { correct: "16–17", band: 5.0 }, { correct: "13–15", band: 4.5 },
  { correct: "10–12", band: 4.0 },
];

const READING_ROWS = [
  { correct: "39–40", band: 9.0 }, { correct: "37–38", band: 8.5 },
  { correct: "35–36", band: 8.0 }, { correct: "33–34", band: 7.5 },
  { correct: "30–32", band: 7.0 }, { correct: "27–29", band: 6.5 },
  { correct: "23–26", band: 6.0 }, { correct: "19–22", band: 5.5 },
  { correct: "15–18", band: 5.0 }, { correct: "13–14", band: 4.5 },
  { correct: "10–12", band: 4.0 },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface BundleTest {
  id: string;
  title: string;
  examType: string;
  durationMins: number;
  questionCount: number;
  sectionCount: number;
  bundleOrder: number | null;
  latestAttempt: {
    id: string;
    correctCount: number;
    totalQuestions: number;
    bandScore: number | null;
    scorePercent: number;
    submittedAt: string;
    mode: string;
  } | null;
}

interface BundleProgress {
  bundle: { id: string; title: string; examType: string };
  tests: BundleTest[];
}

function isListening(title: string) {
  return title.toLowerCase().includes("listening");
}

function skillBand(test: BundleTest): number | null {
  if (!test.latestAttempt) return null;
  const { correctCount, totalQuestions } = test.latestAttempt;
  if (!totalQuestions) return null;
  const score = Math.round((correctCount / totalQuestions) * 40);
  const table = isListening(test.title) ? LISTENING_BANDS : READING_BANDS;
  return rawToBand(score, table);
}

// ─── Score Table Component ────────────────────────────────────────────────────

function ScoreTable() {
  const [open, setOpen] = useState(false);

  return (
    <div className="brutal-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm text-foreground">IELTS Band Score Conversion Table</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
            {/* Listening */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Listening (out of 40)</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-3 py-1.5 text-left font-semibold text-slate-600">Correct</th>
                    <th className="border border-slate-200 px-3 py-1.5 text-left font-semibold text-slate-600">Band</th>
                  </tr>
                </thead>
                <tbody>
                  {LISTENING_ROWS.map((r) => (
                    <tr key={r.band} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-1.5 font-mono">{r.correct}</td>
                      <td className={`border border-slate-200 px-3 py-1.5 font-bold ${r.band >= 7 ? "text-emerald-600" : r.band >= 5 ? "text-amber-600" : "text-slate-500"}`}>
                        {r.band.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reading Academic */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Reading Academic (out of 40)</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-3 py-1.5 text-left font-semibold text-slate-600">Correct</th>
                    <th className="border border-slate-200 px-3 py-1.5 text-left font-semibold text-slate-600">Band</th>
                  </tr>
                </thead>
                <tbody>
                  {READING_ROWS.map((r) => (
                    <tr key={r.band} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-1.5 font-mono">{r.correct}</td>
                      <td className={`border border-slate-200 px-3 py-1.5 font-bold ${r.band >= 7 ? "text-emerald-600" : r.band >= 5 ? "text-amber-600" : "text-slate-500"}`}>
                        {r.band.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            * Official Cambridge IELTS band score conversion. Band scores are rounded to the nearest 0.5.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BundleDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: progress, isLoading } = useQuery({
    queryKey: ["bundle-progress", id],
    queryFn: async () => {
      const { data } = await api.get(`/bundles/${id}/progress`);
      return data as BundleProgress;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-semibold text-foreground">Bundle not found</p>
        <Link href="/tests" className="text-primary text-sm hover:underline mt-2 inline-block">
          Back to Test Library
        </Link>
      </div>
    );
  }

  const { bundle, tests } = progress;
  const completedTests = tests.filter((t) => t.latestAttempt !== null);
  const allDone = completedTests.length === tests.length && tests.length > 0;
  const nextTest = tests.find((t) => t.latestAttempt === null);

  // Aggregate IELTS band score (average of per-test bands)
  const completedBands = completedTests.map((t) => skillBand(t)).filter((b): b is number => b !== null);
  const avgBand = completedBands.length > 0
    ? Math.round(completedBands.reduce((a, b) => a + b, 0) / completedBands.length * 2) / 2
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Back */}
      <Link
        href="/tests"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Test Library
      </Link>

      {/* Header card */}
      <div className="brutal-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-foreground">{bundle.title}</h1>
            <p className="text-xs text-slate-400 mt-1">
              {tests.length} tests · {bundle.examType.replace("_", " ")}
              {completedTests.length > 0 && ` · ${completedTests.length}/${tests.length} completed`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Progress</span>
            <span>{completedTests.length} / {tests.length}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full border border-slate-200 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${tests.length ? (completedTests.length / tests.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Aggregate score (if any tests done) */}
        {avgBand !== null && (
          <div className={`mt-5 flex items-center gap-4 p-4 rounded-xl border-2 ${allDone ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-200"}`}>
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center border-2 font-extrabold text-xl ${allDone ? "bg-emerald-100 border-emerald-400 text-emerald-700" : "bg-amber-100 border-amber-300 text-amber-700"}`}>
              {avgBand.toFixed(1)}
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">
                {allDone ? "Overall IELTS Band Score" : "Current Avg Band (in progress)"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {allDone
                  ? "Based on Listening + Reading scores from this bundle"
                  : `Based on ${completedBands.length} of ${tests.length} tests completed`}
              </p>
              {completedTests.map((t) => {
                const band = skillBand(t);
                if (!band) return null;
                const label = isListening(t.title) ? "Listening" : "Reading";
                return (
                  <span key={t.id} className={`inline-flex items-center gap-1 text-xs font-semibold mt-1 mr-3 px-2 py-0.5 rounded border ${bandColor(band)}`}>
                    {label}: {band.toFixed(1)}
                  </span>
                );
              })}
            </div>
            {allDone && <Trophy className="w-6 h-6 text-emerald-500 ml-auto shrink-0" />}
          </div>
        )}

        {/* CTA button */}
        <div className="mt-5">
          {allDone ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700 font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                All tests completed!
              </div>
              <Link href={`/tests/${tests[0]?.id}?bundle=${id}`}>
                <button className="brutal-btn bg-white text-foreground py-2 px-5 text-sm cursor-pointer">
                  Retake Bundle
                </button>
              </Link>
            </div>
          ) : nextTest ? (
            <Link href={`/tests/${nextTest.id}?bundle=${id}`}>
              <button className="brutal-btn bg-foreground text-white py-2.5 px-6 text-sm flex items-center gap-2 cursor-pointer">
                <Play className="w-4 h-4" />
                {completedTests.length === 0 ? "Start Bundle" : "Continue Bundle"}
              </button>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Test list */}
      <div className="space-y-3">
        {tests.map((test, idx) => {
          const done = test.latestAttempt !== null;
          const band = skillBand(test);
          const isNext = !done && test.id === nextTest?.id;
          const { latestAttempt: a } = test;

          return (
            <div
              key={test.id}
              className={`brutal-card p-5 flex items-center gap-5 ${isNext ? "ring-2 ring-primary" : ""}`}
            >
              {/* Number / status icon */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border-2 ${
                done
                  ? "bg-emerald-500 border-emerald-600 text-white"
                  : isNext
                    ? "bg-primary border-primary/70 text-white"
                    : "bg-slate-100 border-slate-200 text-slate-400"
              }`}>
                {done ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-foreground truncate">{test.title}</h3>
                  {isNext && (
                    <span className="text-xs bg-primary text-white font-semibold px-2 py-0.5 rounded-full">
                      Next
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {test.durationMins} min
                  </span>
                  <span>{test.sectionCount} sections · {test.questionCount} questions</span>
                </div>

                {/* Result row */}
                {done && a && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs text-slate-500">
                      {a.correctCount}/{a.totalQuestions} correct
                    </span>
                    {band !== null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${bandColor(band)}`}>
                        Band {band.toFixed(1)}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {new Date(a.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                )}
              </div>

              {/* Action */}
              <Link href={`/tests/${test.id}?bundle=${id}`} className="shrink-0">
                <button className={`brutal-btn py-2 px-4 text-sm cursor-pointer whitespace-nowrap ${
                  done
                    ? "bg-white text-foreground hover:bg-slate-50"
                    : isNext
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "bg-white text-foreground"
                }`}>
                  {done ? "Retake" : isNext ? (
                    <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> Take Test</span>
                  ) : "Take Test"}
                </button>
              </Link>
            </div>
          );
        })}
      </div>

      {/* IELTS Score Conversion Table */}
      <ScoreTable />

      {/* Note about full band score */}
      {tests.length > 0 && (
        <p className="text-xs text-slate-400 text-center pb-4">
          This bundle covers Listening and Reading. Full IELTS band scores (including Writing and Speaking) require a complete 4-skill test.
        </p>
      )}
    </div>
  );
}
