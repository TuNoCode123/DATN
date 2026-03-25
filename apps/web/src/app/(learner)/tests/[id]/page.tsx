'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Checkbox, Select, message } from 'antd';
import {
  Clock,
  Users,
  Lightbulb,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';

interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  options: any;
}

interface QuestionGroupFromAPI {
  id: string;
  questionType: string;
  orderIndex: number;
  instructions: string | null;
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

interface TestFromAPI {
  id: string;
  title: string;
  examType: string;
  format: string;
  durationMins: number;
  sectionCount: number;
  questionCount: number;
  attemptCount: number;
  commentCount: number;
  description: string | null;
  sections: SectionFromAPI[];
  tags: { tag: { id: string; name: string } }[];
}

const TIME_OPTIONS = [
  { value: 0, label: 'No time limit' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 20, label: '20 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 40, label: '40 minutes' },
  { value: 60, label: '60 minutes' },
];

function getQuestionTypeBadge(type: string): string {
  const map: Record<string, string> = {
    MULTIPLE_CHOICE: 'Multiple Choice',
    NOTE_FORM_COMPLETION: 'Note/Form Completion',
    TABLE_COMPLETION: 'Table Completion',
    SUMMARY_COMPLETION: 'Summary Completion',
    MATCHING: 'Matching',
  };
  return map[type] || type;
}

export default function TestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.id as string;

  const [mode, setMode] = useState<'practice' | 'full' | 'discussion'>('practice');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [timeLimit, setTimeLimit] = useState(0);
  const [starting, setStarting] = useState(false);

  const { data: test, isLoading } = useQuery({
    queryKey: ['test', testId],
    queryFn: async () => {
      const { data } = await api.get(`/tests/${testId}`);
      return data as TestFromAPI;
    },
  });

  const toggleSection = (sectionId: string) => {
    setSelectedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((s) => s !== sectionId) : [...prev, sectionId]
    );
  };

  const handleStart = async () => {
    if (!test) return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      message.warning('Please sign in to take a test');
      router.push('/login');
      return;
    }

    setStarting(true);
    try {
      const sectionIds = mode === 'full' ? test.sections.map((s) => s.id) : selectedSections;
      const { data: attempt } = await api.post('/attempts', {
        testId: test.id,
        mode: mode === 'full' ? 'FULL_TEST' : 'PRACTICE',
        sectionIds,
        timeLimitMins: timeLimit > 0 ? timeLimit : undefined,
      });
      router.push(`/tests/${testId}/attempt?attemptId=${attempt.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Could not start the test';
      message.error(msg);
    } finally {
      setStarting(false);
    }
  };

  if (isLoading || !test) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sectionTypeTags = (section: SectionFromAPI): string[] => {
    const types = new Set(section.questionGroups.map((g) => g.questionType));
    return Array.from(types).map(
      (t) => `[${section.skill === 'LISTENING' ? 'Listening' : 'Reading'}] ${getQuestionTypeBadge(t)}`
    );
  };

  return (
    <div className="max-w-3xl">
      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        {test.tags.map((t) => (
          <span
            key={t.tag.id}
            className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground border border-teal-200 font-semibold"
          >
            #{t.tag.name}
          </span>
        ))}
      </div>

      <h1 className="text-2xl font-extrabold text-foreground mb-5">{test.title}</h1>

      {/* Info card */}
      <div className="brutal-card p-5 mb-6">
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            {test.durationMins} min
          </span>
          <span className="text-slate-300">|</span>
          <span>{test.sectionCount} sections</span>
          <span className="text-slate-300">|</span>
          <span>{test.questionCount} questions</span>
          <span className="text-slate-300">|</span>
          <span>{test.commentCount} comments</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-2">
          <Users className="w-4 h-4 text-slate-400" />
          <span>{test.attemptCount.toLocaleString()} learners practiced this test</span>
        </div>
      </div>

      <p className="text-sm text-red-500 italic mb-6">
        Note: To get scaled scores (e.g. 990 for TOEIC or 9.0 for IELTS),
        please select FULL TEST mode.
      </p>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1">
        {[
          { key: 'practice' as const, label: 'Practice' },
          { key: 'full' as const, label: 'Full Test' },
          { key: 'discussion' as const, label: 'Discussion' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === tab.key
                ? 'bg-white text-foreground shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Practice mode */}
      {mode === 'practice' && (
        <div>
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-700 leading-relaxed">
              <strong>Pro tip:</strong> Practice individual sections with a custom time limit to
              focus on accuracy without the pressure of completing the full test.
            </p>
          </div>

          <p className="text-sm font-bold text-foreground mb-3">Select sections to practice</p>

          <div className="mb-6 flex flex-col gap-3">
            {test.sections.map((section) => (
              <div key={section.id} className="brutal-card p-4">
                <Checkbox
                  checked={selectedSections.includes(section.id)}
                  onChange={() => toggleSection(section.id)}
                >
                  <span className="text-sm font-semibold text-foreground">
                    {section.title} ({section.questionCount} questions)
                  </span>
                </Checkbox>
                <div className="ml-6 mt-2 flex flex-wrap gap-1.5">
                  {sectionTypeTags(section).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <p className="text-sm font-bold text-foreground mb-2">
              Time limit (leave empty for unlimited)
            </p>
            <Select
              style={{ width: '100%' }}
              value={timeLimit}
              onChange={(val) => setTimeLimit(val)}
              options={TIME_OPTIONS}
              size="large"
            />
          </div>

          <button
            disabled={selectedSections.length === 0 || starting}
            onClick={handleStart}
            className="brutal-btn bg-primary text-white px-8 py-3.5 text-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {starting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                START PRACTICE
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Full test mode */}
      {mode === 'full' && (
        <div>
          <p className="text-sm text-slate-600 mb-6">
            Take the full test with {test.questionCount} questions in {test.durationMins} minutes.
            Results will be converted to the IELTS scale.
          </p>
          <button
            onClick={handleStart}
            disabled={starting}
            className="brutal-btn bg-primary text-white px-8 py-3.5 text-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {starting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                START FULL TEST
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Discussion */}
      {mode === 'discussion' && (
        <div className="brutal-card p-8 text-center">
          <p className="text-slate-500 text-sm">Discussion section coming soon.</p>
        </div>
      )}
    </div>
  );
}
