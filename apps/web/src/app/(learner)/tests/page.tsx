"use client";

import { Suspense, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Search, Clock, Users, MessageSquare, ChevronLeft, ChevronRight, BarChart3, Info, User, X, BookOpen, ListChecks } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const EXAM_CATEGORIES = [
  { key: "all", label: "All" },
  { key: "IELTS_ACADEMIC", label: "IELTS Academic" },
  { key: "IELTS_GENERAL", label: "IELTS General" },
  { key: "TOEIC_LR", label: "TOEIC" },
  { key: "TOEIC_SW", label: "TOEIC SW" },
  { key: "TOEIC_SPEAKING", label: "TOEIC Speaking" },
  { key: "TOEIC_WRITING", label: "TOEIC Writing" },
  { key: "HSK_1", label: "HSK 1" },
  { key: "HSK_2", label: "HSK 2" },
  { key: "HSK_3", label: "HSK 3" },
  { key: "HSK_4", label: "HSK 4" },
  { key: "HSK_5", label: "HSK 5" },
  { key: "HSK_6", label: "HSK 6" },
  { key: "TOPIK_I", label: "TOPIK I" },
  { key: "TOPIK_II", label: "TOPIK II" },
  { key: "JLPT_N5", label: "N5" },
  { key: "JLPT_N4", label: "N4" },
  { key: "JLPT_N3", label: "N3" },
  { key: "JLPT_N2", label: "N2" },
  { key: "JLPT_N1", label: "N1" },
  { key: "DIGITAL_SAT", label: "Digital SAT" },
  { key: "THPTQG", label: "THPTQG" },
  { key: "ACT", label: "ACT" },
];

const FORMAT_TABS = [
  { key: "all", label: "All Tests" },
  { key: "CONDENSED", label: "Condensed" },
];

const VIEW_MODES = [
  { key: "tests", label: "Individual Tests", icon: ListChecks },
  { key: "bundles", label: "Test Bundles", icon: BookOpen },
];

interface BundleFromAPI {
  id: string;
  title: string;
  description: string | null;
  examType: string;
  isPublished: boolean;
  _count: { tests: number };
}

const PAGE_SIZE = 12;

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function UserSidebar() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="w-64 flex-shrink-0 hidden lg:block">
      <div className="brutal-card p-5 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center border-2 border-border-strong">
          <User className="w-8 h-8 text-white" />
        </div>
        <p className="font-bold text-base text-foreground">
          {user?.displayName || user?.email || "Guest"}
        </p>
        <div className="flex items-start gap-1.5 text-xs text-slate-500 text-center leading-snug">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
          <span>
            You haven&apos;t set a learning goal yet.{" "}
            <a href="#" className="text-primary font-semibold hover:underline cursor-pointer">
              Set one now.
            </a>
          </span>
        </div>
        <button className="w-full flex items-center justify-center gap-2 brutal-btn bg-white text-foreground py-2.5 text-sm cursor-pointer">
          <BarChart3 className="w-4 h-4" />
          View Statistics
        </button>
      </div>
    </div>
  );
}

interface TestFromAPI {
  id: string;
  title: string;
  examType: string;
  format: string;
  durationMins: number;
  attemptCount: number;
  commentCount: number;
  sectionCount: number;
  questionCount: number;
  tags: { tag: { id: string; name: string; slug: string } }[];
}

function TestsContent() {
  const searchParams = useSearchParams();
  const [linkedBanner, setLinkedBanner] = useState(false);
  const [viewMode, setViewMode] = useState<"tests" | "bundles">("tests");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeFormat, setActiveFormat] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (searchParams.get("linked") === "1") {
      setLinkedBanner(true);
      window.history.replaceState({}, "", "/tests");
    }
  }, [searchParams]);

  useEffect(() => {
    const examType = searchParams.get("examType");
    if (examType && EXAM_CATEGORIES.some((c) => c.key === examType)) {
      setActiveCategory(examType);
      setCurrentPage(1);
    }
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ["tests", activeCategory, activeFormat, searchQuery, currentPage],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      };
      if (activeCategory !== "all") params.examType = activeCategory;
      if (activeFormat !== "all") params.format = activeFormat;
      if (searchQuery) params.search = searchQuery;

      const { data } = await api.get("/tests", { params });
      return data as { data: TestFromAPI[]; total: number; page: number; limit: number };
    },
    enabled: viewMode === "tests",
  });

  const { data: bundles, isLoading: bundlesLoading } = useQuery({
    queryKey: ["bundles", activeCategory],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (activeCategory !== "all") params.examType = activeCategory;
      const { data } = await api.get("/bundles", { params });
      return data as BundleFromAPI[];
    },
    enabled: viewMode === "bundles",
  });

  const tests = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleSearch() {
    setSearchQuery(inputValue);
    setCurrentPage(1);
  }

  function handleCategoryChange(key: string) {
    setActiveCategory(key);
    setCurrentPage(1);
  }

  function handleFormatChange(key: string) {
    setActiveFormat(key);
    setCurrentPage(1);
  }

  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0">
        {linkedBanner && (
          <div className="brutal-card bg-blue-50 border-blue-300 p-4 mb-4 flex items-center justify-between">
            <p className="text-sm text-blue-800">
              Your social login has been linked to your existing account. You can now sign in with either method.
            </p>
            <button onClick={() => setLinkedBanner(false)} className="text-blue-400 hover:text-blue-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-extrabold text-foreground">Test Library</h1>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.key}
                onClick={() => setViewMode(mode.key as "tests" | "bundles")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                  viewMode === mode.key
                    ? "bg-white shadow-sm text-foreground border border-slate-200"
                    : "text-slate-500 hover:text-foreground"
                }`}
              >
                <mode.icon className="w-3.5 h-3.5" />
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-5">
          {EXAM_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => handleCategoryChange(cat.key)}
              className={`text-sm px-3 py-1 rounded-full transition-colors cursor-pointer ${
                activeCategory === cat.key
                  ? "bg-primary text-white font-semibold"
                  : "text-slate-600 hover:text-foreground bg-white border border-slate-200 hover:border-primary"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {viewMode === "bundles" ? (
          /* ── Bundles view ─────────────────────────────────────── */
          bundlesLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : bundles && bundles.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {bundles.map((bundle) => (
                <div key={bundle.id} className="brutal-card p-5 flex flex-col min-h-[200px]">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm leading-snug text-foreground">{bundle.title}</h3>
                      <span className="text-xs text-slate-400">{bundle.examType.replace("_", " ")}</span>
                    </div>
                  </div>

                  {bundle.description && (
                    <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">
                      {bundle.description}
                    </p>
                  )}

                  <div className="text-xs text-slate-500 mb-4">
                    {bundle._count.tests} test{bundle._count.tests !== 1 ? "s" : ""}
                  </div>

                  <div className="mt-auto">
                    <Link href={`/tests/bundles/${bundle.id}`} className="block">
                      <button className="w-full brutal-btn bg-white text-foreground py-2.5 text-sm hover:bg-primary hover:text-white cursor-pointer">
                        View Bundle
                      </button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-400 py-16 brutal-card">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-semibold text-foreground mb-2">No bundles available</p>
              <p className="text-sm">Check back later or switch to Individual Tests view.</p>
            </div>
          )
        ) : (
          /* ── Individual tests view ────────────────────────────── */
          <>
            {/* Search bar */}
            <div className="flex gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tests by name, question type..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:ring-0 outline-none bg-white transition-colors"
                />
              </div>
              <button
                onClick={handleSearch}
                className="brutal-btn bg-foreground text-white px-6 py-3 text-sm cursor-pointer"
              >
                Search
              </button>
            </div>

            {/* Format tabs */}
            <div className="flex gap-6 mb-6 border-b-2 border-slate-200">
              {FORMAT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleFormatChange(tab.key)}
                  className={`pb-3 text-sm font-semibold transition-colors relative cursor-pointer ${
                    activeFormat === tab.key
                      ? "text-primary"
                      : "text-slate-500 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {activeFormat === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Test grid */}
            {isLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tests.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                {tests.map((test) => (
                  <div
                    key={test.id}
                    className="brutal-card p-5 flex flex-col min-h-[260px] cursor-pointer"
                  >
                    <h3 className="font-bold text-sm leading-snug text-foreground mb-4">
                      {test.title}
                    </h3>

                    <div className="text-xs text-slate-500 space-y-1.5 mb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {test.durationMins} min
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {formatNumber(test.attemptCount)}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {formatNumber(test.commentCount)}
                        </span>
                      </div>
                      <div>
                        {test.sectionCount} sections | {test.questionCount} questions
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {test.tags.map((t) => (
                        <span
                          key={t.tag.id}
                          className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-teal-200 font-medium"
                        >
                          #{t.tag.name}
                        </span>
                      ))}
                    </div>

                    <div className="mt-auto">
                      <Link href={`/tests/${test.id}`} className="block">
                        <button className="w-full brutal-btn bg-white text-foreground py-2.5 text-sm hover:bg-primary hover:text-white cursor-pointer">
                          View Details
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-400 py-16 brutal-card">
                <p className="text-lg font-semibold text-foreground mb-2">No tests found</p>
                <p className="text-sm">Try adjusting your filters or search query.</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border-2 border-slate-200 text-slate-500 hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border-2 text-sm font-semibold transition-colors cursor-pointer ${
                      currentPage === page
                        ? "bg-primary border-primary text-white"
                        : "border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border-2 border-slate-200 text-slate-500 hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <UserSidebar />
    </div>
  );
}

export default function TestsPage() {
  return (
    <Suspense>
      <TestsContent />
    </Suspense>
  );
}
