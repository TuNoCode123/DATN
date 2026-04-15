'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowUp, ArrowDown, Save, Send, Plus, Trash2, Loader2,
  Headphones, BookOpen, Pen, Mic, AlertTriangle,
  Eye, ChevronDown, ChevronRight, ChevronLeft,
  Image, Music, Settings2, FileText, HelpCircle, Info, X,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileUpload } from '@/components/admin/file-upload';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
const TiptapEditor = dynamic(
  () => import('@/components/admin/tiptap-editor'),
  { ssr: false },
);
const TiptapMiniEditor = dynamic(
  () => import('@/components/admin/tiptap-mini-editor'),
  { ssr: false },
);
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import {
  useAdminTest,
  useToggleTestPublish,
  useValidateTest,
  useSyncTest,
  useAddMissingSections,
  useRenumberQuestions,
} from '@/features/admin/hooks/use-admin-tests';
import type {
  ExamType,
  SectionSkill,
  QuestionType,
  AdminTest,
  AdminTestSection,
  AdminQuestionGroup,
  AdminQuestion,
  AdminPassage,
  ValidationResult,
} from '@/features/admin/types';
import { cn } from '@/lib/utils';
import { getAcceptedForms } from '@/lib/answer-matcher';

// ── Helper: generate temp IDs for new entities ───────

let _tempCounter = 0;
function tempId() {
  return `_new_${++_tempCounter}_${Date.now()}`;
}

// ── Deep clone helper ────────────────────────────────

function cloneTest(test: AdminTest): AdminTest {
  return JSON.parse(JSON.stringify(test));
}

// ── Skill icons & colors ─────────────────────────────

const SKILL_CONFIG: Record<SectionSkill, { icon: typeof Headphones; color: string; bg: string; border: string }> = {
  LISTENING: { icon: Headphones, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  READING: { icon: BookOpen, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200' },
  WRITING: { icon: Pen, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  SPEAKING: { icon: Mic, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
};

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
  { value: 'TRUE_FALSE_NOT_GIVEN', label: 'True / False / Not Given' },
  { value: 'YES_NO_NOT_GIVEN', label: 'Yes / No / Not Given' },
  { value: 'MATCHING_HEADINGS', label: 'Matching Headings' },
  { value: 'MATCHING_INFORMATION', label: 'Matching Information' },
  { value: 'MATCHING_FEATURES', label: 'Matching Features' },
  { value: 'MATCHING_SENTENCE_ENDINGS', label: 'Matching Sentence Endings' },
  { value: 'SENTENCE_COMPLETION', label: 'Sentence Completion' },
  { value: 'SUMMARY_COMPLETION', label: 'Summary Completion' },
  { value: 'NOTE_COMPLETION', label: 'Note Completion' },
  { value: 'TABLE_COMPLETION', label: 'Table Completion' },
  { value: 'FORM_COMPLETION', label: 'Form Completion' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
  { value: 'LABELLING', label: 'Labelling' },
  // TOEIC Speaking
  { value: 'READ_ALOUD', label: 'Read Aloud' },
  { value: 'DESCRIBE_PICTURE', label: 'Describe a Picture' },
  { value: 'RESPOND_TO_QUESTIONS', label: 'Respond to Questions' },
  { value: 'PROPOSE_SOLUTION', label: 'Propose a Solution' },
  { value: 'EXPRESS_OPINION', label: 'Express an Opinion' },
  // TOEIC Writing
  { value: 'WRITE_SENTENCES', label: 'Write Sentences' },
  { value: 'RESPOND_WRITTEN_REQUEST', label: 'Respond to a Written Request' },
  { value: 'WRITE_OPINION_ESSAY', label: 'Write an Opinion Essay' },
  // HSK Writing
  { value: 'SENTENCE_REORDER', label: 'Sentence Reorder (排列顺序)' },
  { value: 'KEYWORD_COMPOSITION', label: 'Keyword Composition (看词写作)' },
  { value: 'PICTURE_COMPOSITION', label: 'Picture Composition (看图写作)' },
];

// ── Main Editor Page ─────────────────────────────────

export default function TestEditorPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.id as string;

  const { data: serverTest, isLoading } = useAdminTest(testId);
  const { data: validation } = useValidateTest(testId);
  const [activeTab, setActiveTab] = useState(0);
  const [activeSkillTab, setActiveSkillTab] = useState<'SPEAKING' | 'WRITING'>('SPEAKING');
  const [showMetadata, setShowMetadata] = useState(false);

  // Local state — the single source of truth for editing
  const [localTest, setLocalTest] = useState<AdminTest | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const togglePublish = useToggleTestPublish();
  const syncTest = useSyncTest();
  const renumber = useRenumberQuestions();
  const addMissingSections = useAddMissingSections();

  const tabsRef = useRef<HTMLDivElement>(null);

  // Initialize local state when server data loads
  useEffect(() => {
    if (serverTest && !localTest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalTest(cloneTest(serverTest));
    }
  }, [serverTest, localTest]);

  // Re-sync local state when server data changes (after non-sync mutations like publish/renumber)
  // Only if not dirty (don't overwrite unsaved changes)
  useEffect(() => {
    if (serverTest && !isDirty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalTest(cloneTest(serverTest));
    }
  }, [serverTest, isDirty]);

  // Update local test helper — marks dirty automatically
  const updateLocal = useCallback((updater: (test: AdminTest) => AdminTest) => {
    setLocalTest((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      return next;
    });
    setIsDirty(true);
  }, []);

  // Save All — single API call
  async function handleSaveAll() {
    if (!localTest) return;

    // Auto-assign questionNumbers: sequential across all sections, starting from 1
    const testWithNumbers = cloneTest(localTest);
    let qNum = 1;
    for (const section of testWithNumbers.sections || []) {
      for (const group of section.questionGroups || []) {
        for (const q of group.questions || []) {
          q.questionNumber = qNum++;
        }
      }
    }

    // Build the sync payload from local state
    const payload = {
      title: testWithNumbers.title,
      examType: testWithNumbers.examType,
      durationMins: testWithNumbers.durationMins,
      description: testWithNumbers.description,
      tagIds: testWithNumbers.tags?.map((t) => t.tagId) ?? [],
      sections: (testWithNumbers.sections || []).map((section, sIdx) => ({
        // Only send real IDs (not temp IDs)
        ...(section.id && !section.id.startsWith('_new_') ? { id: section.id } : {}),
        title: section.title,
        skill: section.skill,
        orderIndex: sIdx,
        instructions: section.instructions,
        audioUrl: section.audioUrl,
        durationMins: section.durationMins,
        passages: (section.passages || []).map((passage, pIdx) => ({
          ...(passage.id && !passage.id.startsWith('_new_') ? { id: passage.id } : {}),
          _tempId: passage.id?.startsWith('_new_') ? passage.id : undefined,
          title: passage.title,
          contentHtml: passage.contentHtml,
          imageUrl: passage.imageUrl,
          audioUrl: passage.audioUrl,
          transcript: passage.transcript,
          imageLayout: passage.imageLayout,
          imageSize: passage.imageSize,
          images: passage.images?.filter((img) => img.url) || null,
          orderIndex: pIdx,
        })),
        questionGroups: (section.questionGroups || []).map((group, gIdx) => ({
          ...(group.id && !group.id.startsWith('_new_') ? { id: group.id } : {}),
          questionType: group.questionType,
          orderIndex: gIdx,
          // Resolve passage reference
          ...(group.passageId
            ? group.passageId.startsWith('_new_')
              ? { _tempPassageId: group.passageId, passageId: undefined }
              : { passageId: group.passageId }
            : {}),
          instructions: group.instructions,
          matchingOptions: group.matchingOptions,
          audioUrl: group.audioUrl,
          imageUrl: group.imageUrl,
          imageSize: group.imageSize,
          questions: (group.questions || []).map((q, qIdx) => ({
            ...(q.id && !q.id.startsWith('_new_') ? { id: q.id } : {}),
            questionNumber: q.questionNumber,
            orderIndex: qIdx,
            stem: q.stem,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            imageUrl: q.imageUrl,
            audioUrl: q.audioUrl,
            transcript: q.transcript,
            imageLayout: q.imageLayout,
            imageSize: q.imageSize,
            metadata: q.metadata,
          })),
        })),
      })),
    };

    try {
      const result = await syncTest.mutateAsync({ id: testId, payload });
      setLocalTest(cloneTest(result));
      setIsDirty(false);
      toast.success('All changes saved');
    } catch (err: unknown) {
      const axiosData = (err as { response?: { data?: { message?: string } } })?.response?.data;
      toast.error(axiosData?.message || (err instanceof Error ? err.message : 'Failed to save'));
    }
  }

  // Section-level operations that modify local state
  function handleAddSection() {
    updateLocal((test) => {
      const newSection: AdminTestSection = {
        id: tempId(),
        testId,
        title: `Section ${(test.sections?.length || 0) + 1}`,
        skill: 'READING' as SectionSkill,
        orderIndex: test.sections?.length || 0,
        instructions: null,
        audioUrl: null,
        durationMins: null,
        questionCount: 0,
        passages: [],
        questionGroups: [],
      };
      return { ...test, sections: [...(test.sections || []), newSection] };
    });
    setActiveTab((localTest?.sections?.length || 0));
    toast.success('Section added (unsaved)');
  }

  async function handleTogglePublish() {
    if (isDirty) {
      toast.error('Save changes before publishing');
      return;
    }
    await togglePublish.mutateAsync(testId);
    toast.success(localTest?.isPublished ? 'Unpublished' : 'Published');
  }

  async function handleRenumber() {
    if (isDirty) {
      toast.error('Save changes before renumbering');
      return;
    }
    await renumber.mutateAsync(testId);
    toast.success('Questions renumbered');
  }

  function scrollTabs(direction: 'left' | 'right') {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!localTest) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <HelpCircle className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">Test not found.</p>
          <Button variant="outline" onClick={() => router.push('/admin-tests')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tests
          </Button>
        </div>
      </div>
    );
  }

  const sections: AdminTestSection[] = localTest.sections || [];
  const activeSection = sections[activeTab];

  // Compute local question count
  const localQuestionCount = sections.reduce(
    (sum, s) => sum + (s.questionGroups || []).reduce((gs, g) => gs + (g.questions?.length || 0), 0),
    0,
  );

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* ─── Top Bar ─── */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => {
            if (isDirty && !confirm('You have unsaved changes. Leave anyway?')) return;
            router.push('/admin-tests');
          }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate leading-tight">{localTest.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs font-medium">
                {localTest.examType.replace('_', ' ')}
              </Badge>
              <span className="text-xs text-muted-foreground">{localTest.durationMins} min</span>
              <span className="text-xs text-muted-foreground">&middot;</span>
              <span className="text-xs text-muted-foreground">{localQuestionCount} questions</span>
              <Badge
                variant={localTest.isPublished ? 'default' : 'secondary'}
                className={cn(
                  'text-xs',
                  localTest.isPublished
                    ? 'bg-green-100 text-green-700 hover:bg-green-100'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-100',
                )}
              >
                {localTest.isPublished ? 'Published' : 'Draft'}
              </Badge>
              {isDirty && (
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 bg-amber-50">
                  Unsaved changes
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowMetadata(!showMetadata)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Edit Info
          </Button>
          <Button variant="outline" size="sm" onClick={handleRenumber}>
            Renumber
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/admin-tests/${testId}/preview`)}>
            <Eye className="mr-1.5 h-4 w-4" /> Preview
          </Button>
          {/* ─── Save All Button ─── */}
          <Button
            size="sm"
            disabled={!isDirty || syncTest.isPending}
            className={cn(
              'gap-1.5 transition-all',
              isDirty
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200'
                : 'bg-gray-100 text-gray-400',
            )}
            onClick={handleSaveAll}
          >
            {syncTest.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {syncTest.isPending ? 'Saving...' : 'Save All'}
          </Button>
          <Button
            size="sm"
            className={cn(
              localTest.isPublished
                ? 'bg-orange-500 hover:bg-orange-600'
                : 'bg-green-600 hover:bg-green-700',
            )}
            onClick={handleTogglePublish}
          >
            <Send className="mr-1.5 h-4 w-4" />
            {localTest.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
        </div>
      </div>

      {/* ─── Validation Warnings ─── */}
      {validation && !validation.valid && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 shrink-0">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 space-y-1">
              {(validation as ValidationResult).warnings.slice(0, 3).map((w: string, i: number) => (
                <p key={i} className="text-sm text-amber-800">{w}</p>
              ))}
              {(validation as ValidationResult).warnings.length > 3 && (
                <p className="text-sm text-amber-600 font-medium">
                  +{(validation as ValidationResult).warnings.length - 3} more warnings
                </p>
              )}
            </div>
            {(validation as ValidationResult).warnings.some((w: string) => /should have \d+ (parts|sections|passages)/.test(w)) && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100"
                disabled={addMissingSections.isPending || isDirty}
                onClick={async () => {
                  if (isDirty) {
                    toast.error('Save changes first');
                    return;
                  }
                  await addMissingSections.mutateAsync(testId);
                  toast.success('Missing sections added');
                }}
              >
                {addMissingSections.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1.5" />
                )}
                Add Missing Sections
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ─── Test Metadata Panel ─── */}
      {showMetadata && (
        <div className="bg-white border-b px-6 py-5 shrink-0">
          <TestMetadataForm
            test={localTest}
            onChange={(updates) => {
              updateLocal((t) => ({ ...t, ...updates }));
            }}
            onClose={() => setShowMetadata(false)}
          />
        </div>
      )}

      {/* ─── Section Tabs ─── */}
      {localTest.examType === 'TOEIC_SW' ? (
        <div className="bg-white border-b shrink-0">
          {/* Tier 1: Speaking / Writing skill picker */}
          <div className="flex items-center border-b border-slate-100 px-4">
            {([
              { skill: 'SPEAKING' as const, label: 'Speaking', icon: Mic, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-500', qTotal: sections.filter((s) => s.skill === 'SPEAKING').reduce((sum, s) => sum + (s.questionGroups || []).reduce((gs, g) => gs + (g.questions?.length || 0), 0), 0), sCount: sections.filter((s) => s.skill === 'SPEAKING').length },
              { skill: 'WRITING' as const, label: 'Writing', icon: Pen, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-500', qTotal: sections.filter((s) => s.skill === 'WRITING').reduce((sum, s) => sum + (s.questionGroups || []).reduce((gs, g) => gs + (g.questions?.length || 0), 0), 0), sCount: sections.filter((s) => s.skill === 'WRITING').length },
            ]).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSkillTab === tab.skill;
              return (
                <button
                  key={tab.skill}
                  className={cn(
                    'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer',
                    isActive
                      ? `${tab.border} ${tab.color} ${tab.bg}`
                      : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50',
                  )}
                  onClick={() => {
                    setActiveSkillTab(tab.skill);
                    // Auto-select first section of this skill
                    const firstIdx = sections.findIndex((s) => s.skill === tab.skill);
                    if (firstIdx >= 0) setActiveTab(firstIdx);
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  <span className={cn(
                    'inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-xs font-semibold',
                    isActive ? 'bg-white text-current' : 'bg-slate-100 text-slate-400',
                  )}>
                    {tab.qTotal}
                  </span>
                  <span className="text-xs font-normal text-slate-400">
                    ({tab.sCount} {tab.sCount === 1 ? 'section' : 'sections'})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tier 2: Sections within selected skill */}
          <div className="flex items-center px-2">
            <div
              ref={tabsRef}
              className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-2 py-1"
            >
              {sections.map((section, index) => {
                if (section.skill !== activeSkillTab) return null;
                const skillCfg = SKILL_CONFIG[section.skill];
                const Icon = skillCfg.icon;
                const isActive = activeTab === index;
                const qCount = (section.questionGroups || []).reduce((s, g) => s + (g.questions?.length || 0), 0);
                // Strip "Speaking: " or "Writing: " prefix for cleaner display
                const shortTitle = section.title.replace(/^(Speaking|Writing):\s*/i, '');
                return (
                  <button
                    key={section.id}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                      isActive
                        ? `${skillCfg.bg} ${skillCfg.color} shadow-sm ring-1 ${skillCfg.border}`
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                    onClick={() => setActiveTab(index)}
                  >
                    <Icon className={cn('h-4 w-4', isActive ? skillCfg.color : 'text-muted-foreground')} />
                    <span className="max-w-[180px] truncate">{shortTitle}</span>
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-xs font-semibold',
                      isActive ? 'bg-white/80 text-current' : 'bg-muted text-muted-foreground',
                    )}>
                      {qCount}
                    </span>
                  </button>
                );
              })}

              <Button
                variant="ghost"
                size="sm"
                className="text-sm shrink-0 ml-1 text-muted-foreground hover:text-foreground"
                onClick={handleAddSection}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Section
              </Button>
            </div>
          </div>
        </div>
      ) : (
      <div className="bg-white border-b shrink-0">
        <div className="flex items-center px-2">
          {sections.length > 4 && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => scrollTabs('left')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}

          <div
            ref={tabsRef}
            className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-2 py-1"
          >
            {sections.map((section, index) => {
              const skillCfg = SKILL_CONFIG[section.skill];
              const Icon = skillCfg.icon;
              const isActive = activeTab === index;
              const qCount = (section.questionGroups || []).reduce((s, g) => s + (g.questions?.length || 0), 0);
              return (
                <button
                  key={section.id}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                    isActive
                      ? `${skillCfg.bg} ${skillCfg.color} shadow-sm ring-1 ${skillCfg.border}`
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                  onClick={() => setActiveTab(index)}
                >
                  <Icon className={cn('h-4 w-4', isActive ? skillCfg.color : 'text-muted-foreground')} />
                  <span className="max-w-[160px] truncate">{section.title}</span>
                  <span className={cn(
                    'inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-xs font-semibold',
                    isActive ? 'bg-white/80 text-current' : 'bg-muted text-muted-foreground',
                  )}>
                    {qCount}
                  </span>
                </button>
              );
            })}

            <Button
              variant="ghost"
              size="sm"
              className="text-sm shrink-0 ml-1 text-muted-foreground hover:text-foreground"
              onClick={handleAddSection}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Section
            </Button>
          </div>

          {sections.length > 4 && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => scrollTabs('right')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      )}

      {/* ─── Active Section Content ─── */}
      <div className="flex-1 overflow-y-auto">
        {activeSection ? (
          <SectionEditor
            key={activeSection.id}
            section={activeSection}
            examType={localTest.examType}
            sectionQuestionOffset={sections.slice(0, activeTab).reduce(
              (sum, s) => sum + (s.questionGroups || []).reduce((gs, g) => gs + (g.questions?.length || 0), 0), 0,
            )}
            onChange={(updatedSection) => {
              updateLocal((test) => ({
                ...test,
                sections: (test.sections || []).map((s) =>
                  s.id === activeSection.id ? updatedSection : s,
                ),
              }));
            }}
            onDelete={() => {
              updateLocal((test) => ({
                ...test,
                sections: (test.sections || []).filter((s) => s.id !== activeSection.id),
              }));
              setActiveTab(Math.max(0, activeTab - 1));
              toast.success('Section deleted (unsaved)');
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium">No sections yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Add a section to start building your test</p>
            <Button variant="outline" className="mt-5" onClick={handleAddSection}>
              <Plus className="mr-2 h-4 w-4" /> Add First Section
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Test Metadata Form (local state) ─────────────────

function TestMetadataForm({
  test,
  onChange,
  onClose,
}: {
  test: AdminTest;
  onChange: (updates: Partial<AdminTest>) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Test Information</h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
          Close
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Label className="text-sm font-medium">Title</Label>
          <Input
            value={test.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label className="text-sm font-medium">Duration (min)</Label>
          <Input
            type="number"
            value={test.durationMins}
            onChange={(e) => onChange({ durationMins: parseInt(e.target.value) || 0 })}
            className="mt-1.5"
          />
        </div>
        <div className="md:col-span-3">
          <Label className="text-sm font-medium">Description</Label>
          <Textarea
            value={test.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            className="mt-1.5"
            rows={2}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground italic">Changes are saved when you click &quot;Save All&quot;</p>
    </div>
  );
}

// ── Section Setup Guide ──────────────────────────────

const TOEIC_LR_GUIDE: Record<string, { title: string; skill: string; questions: string; steps: string[] }> = {
  'part 1': {
    title: 'Part 1: Photographs',
    skill: 'LISTENING',
    questions: '6 questions',
    steps: [
      'Set skill to LISTENING, upload section audio file',
      'Add 1 Question Group: MULTIPLE_CHOICE',
      'Add 6 questions, each with an image (photo) and 4 options (A-D)',
      'Correct answer is the statement that best describes the photo',
    ],
  },
  'part 2': {
    title: 'Part 2: Question-Response',
    skill: 'LISTENING',
    questions: '25 questions',
    steps: [
      'Set skill to LISTENING, upload section audio file',
      'Add 1 Question Group: MULTIPLE_CHOICE',
      'Add 25 questions with 3 options each (A-C)',
      'No images needed — audio only',
    ],
  },
  'part 3': {
    title: 'Part 3: Conversations',
    skill: 'LISTENING',
    questions: '39 questions (13 sets × 3)',
    steps: [
      'Set skill to LISTENING, upload section audio file',
      'Add 13 Question Groups: MULTIPLE_CHOICE (one per conversation)',
      'Each group has 3 questions with 4 options (A-D)',
      'Optionally add images (graphics/charts) to groups that need them',
    ],
  },
  'part 4': {
    title: 'Part 4: Talks',
    skill: 'LISTENING',
    questions: '30 questions (10 sets × 3)',
    steps: [
      'Set skill to LISTENING, upload section audio file',
      'Add 10 Question Groups: MULTIPLE_CHOICE (one per talk)',
      'Each group has 3 questions with 4 options (A-D)',
      'Optionally add images (graphics/charts) to groups that need them',
    ],
  },
  'part 5': {
    title: 'Part 5: Incomplete Sentences',
    skill: 'READING',
    questions: '30 questions',
    steps: [
      'Set skill to READING — no passages needed',
      'Add 1 Question Group: MULTIPLE_CHOICE',
      'Add 30 questions, each with a sentence stem (with blank) and 4 options (A-D)',
      'Do NOT add passages — questions stand alone',
    ],
  },
  'part 6': {
    title: 'Part 6: Text Completion',
    skill: 'READING',
    questions: '16 questions (4 passages × 4)',
    steps: [
      'Set skill to READING',
      'Add 4 Passages — each with a text containing blanks (use "-------" for blanks, number them 131-146)',
      'Add 4 Question Groups: MULTIPLE_CHOICE (one per passage)',
      '⭐ Link each question group to its passage using the passage dropdown in the group header',
      'Each group has 4 questions with 4 options (A-D)',
      'One question per passage may be a "sentence insertion" type',
    ],
  },
  'part 7': {
    title: 'Part 7: Reading Comprehension',
    skill: 'READING',
    questions: '54 questions',
    steps: [
      'Set skill to READING',
      'Add passages: 10 single passages + 2 double passages + 3 triple passages',
      'For single passages: 1 passage each, add 1 Question Group per passage',
      'For double/triple passages: create multiple passages per set',
      '⭐ Link each question group to its passage using the passage dropdown in the group header',
      'Each question group: MULTIPLE_CHOICE with 2-5 questions, 4 options (A-D)',
      'Passage content can include tables, emails, ads, articles — use the rich text editor',
    ],
  },
};

const TOEIC_SW_SPEAKING_GUIDE: Record<string, { title: string; skill: string; questions: string; steps: string[] }> = {
  'read aloud': {
    title: 'Questions 1-2: Read Aloud',
    skill: 'SPEAKING',
    questions: '2 questions',
    steps: [
      'Add 1 Question Group: READ_ALOUD',
      'Add 2 questions — each with a text passage in the "stem" field',
      'The text should be 1-2 paragraphs (~60-90 words each)',
      'Default timing: 45s prep, 45s response (set in metadata)',
      'Students will read the passage aloud; pronunciation is scored via word alignment',
    ],
  },
  'describe': {
    title: 'Questions 3-4: Describe a Picture',
    skill: 'SPEAKING',
    questions: '2 questions',
    steps: [
      'Add 1 Question Group: DESCRIBE_PICTURE',
      'Add 2 questions — each with an image uploaded via the image field',
      'Leave the "stem" empty — the image IS the prompt',
      'Default timing: 45s prep, 30s response',
      'Students describe what they see; scored by AI for relevance and fluency',
    ],
  },
  'respond to questions': {
    title: 'Questions 5-7: Respond to Questions',
    skill: 'SPEAKING',
    questions: '3 questions',
    steps: [
      'Add 1 Question Group: RESPOND_TO_QUESTIONS',
      'Set group instructions with the scenario context (e.g. "Imagine a market research company calls you...")',
      'Add 3 questions — each with a different question in the "stem" field',
      'Default timing: Q5-6: 0s prep / 15s response, Q7: 0s prep / 30s response',
      'Students answer spoken questions; scored by AI',
    ],
  },
  'propose': {
    title: 'Questions 8-10: Propose a Solution',
    skill: 'SPEAKING',
    questions: '3 questions (1 scenario)',
    steps: [
      'Add 1 Question Group: PROPOSE_SOLUTION',
      'Set group instructions with the scenario/document context (voicemail, table, etc.)',
      'Add up to 3 questions — each with a sub-prompt in the "stem" field',
      'Default timing: 45s prep, 60s response',
      'Students propose solutions; scored by AI for problem-solving and language',
    ],
  },
  'express': {
    title: 'Question 11: Express an Opinion',
    skill: 'SPEAKING',
    questions: '1 question',
    steps: [
      'Add 1 Question Group: EXPRESS_OPINION',
      'Add 1 question — put the opinion prompt in the "stem" field',
      'Example: "Do you agree or disagree that technology improves education?"',
      'Default timing: 30s prep, 60s response',
      'Students give and support their opinion; scored by AI for coherence and reasoning',
    ],
  },
};

const TOEIC_SW_WRITING_GUIDE: Record<string, { title: string; skill: string; questions: string; steps: string[] }> = {
  'write sentences': {
    title: 'Questions 1-5: Write Sentences',
    skill: 'WRITING',
    questions: '5 questions',
    steps: [
      'Add 1 Question Group: WRITE_SENTENCES',
      'Add 5 questions — each with an image (photo) and 2 keywords in metadata',
      'Set metadata: { "keywords": ["word1", "word2"] }',
      'Students write ONE sentence using both keywords that describes the image',
      'Scored by AI for grammar, relevance to image, and correct keyword usage',
    ],
  },
  'respond to request': {
    title: 'Questions 6-7: Respond to a Written Request',
    skill: 'WRITING',
    questions: '2 questions',
    steps: [
      'Add 1 Question Group: RESPOND_WRITTEN_REQUEST',
      'Add 2 questions — put the email/letter content in the "stem" field (use rich text editor)',
      'Set metadata: { "minWords": 50, "maxWords": 150 } (adjust per question)',
      'Students write a reply email/letter responding to the request',
      'Scored by AI for task completion, coherence, and language use',
    ],
  },
  'opinion essay': {
    title: 'Question 8: Write an Opinion Essay',
    skill: 'WRITING',
    questions: '1 question',
    steps: [
      'Add 1 Question Group: WRITE_OPINION_ESSAY',
      'Add 1 question — put the essay prompt in the "stem" field',
      'Set metadata: { "minWords": 300 }',
      'Example: "Some people prefer to work from home. Others prefer to work in an office. Which do you prefer?"',
      'Students write a multi-paragraph essay; scored by AI for argument quality, organization, and language',
    ],
  },
};

const IELTS_READING_GUIDE: Record<string, { title: string; steps: string[] }> = {
  'section 1': {
    title: 'Section 1: Passage 1',
    steps: [
      'Add 1 Passage — the reading text (can include headings labeled A-G, paragraphs, etc.)',
      'Add question groups as needed (common types below):',
      '  • MATCHING_HEADINGS — match paragraph headings',
      '  • TRUE_FALSE_NOT_GIVEN — evaluate statements',
      '  • SENTENCE_COMPLETION / NOTE_COMPLETION / TABLE_COMPLETION — fill in blanks',
      '  • MULTIPLE_CHOICE — choose correct answer',
      '⭐ Link ALL question groups to the passage using the dropdown',
      'Typically 13-14 questions total',
    ],
  },
  'section 2': {
    title: 'Section 2: Passage 2',
    steps: [
      'Add 1 Passage — the reading text',
      'Add question groups (common combinations):',
      '  • MATCHING_INFORMATION — match statements to paragraphs',
      '  • YES_NO_NOT_GIVEN — evaluate writer\'s views',
      '  • SUMMARY_COMPLETION — complete a summary',
      '  • SENTENCE_COMPLETION — complete sentences',
      '⭐ Link ALL question groups to the passage using the dropdown',
      'Typically 13 questions total',
    ],
  },
  'section 3': {
    title: 'Section 3: Passage 3',
    steps: [
      'Add 1 Passage — the most difficult reading text',
      'Add question groups (common combinations):',
      '  • MULTIPLE_CHOICE — choose correct answer(s)',
      '  • MATCHING_FEATURES — match features to categories',
      '  • YES_NO_NOT_GIVEN or TRUE_FALSE_NOT_GIVEN',
      '  • SHORT_ANSWER — answer in 1-3 words',
      '⭐ Link ALL question groups to the passage using the dropdown',
      'Typically 13-14 questions total',
    ],
  },
};

const IELTS_LISTENING_GUIDE: Record<string, { title: string; steps: string[] }> = {
  'section 1': {
    title: 'Section 1: Social Conversation',
    steps: [
      'Set skill to LISTENING, upload section audio',
      'For Form/Table Completion: Add group instructions with the table/form HTML using ___1___, ___2___ for blanks',
      'Add question group: TABLE_COMPLETION or FORM_COMPLETION, click "Sync from Passage"',
      'Fill in the correct answer for each blank',
      'For MCQ: Add a MULTIPLE_CHOICE group (no passage needed)',
      'Typically 10 questions total',
    ],
  },
  'section 2': {
    title: 'Section 2: Monologue (Social)',
    steps: [
      'Set skill to LISTENING, upload section audio',
      'Add question groups (typically 10 questions):',
      '  • MULTIPLE_CHOICE — choose correct answer',
      '  • MATCHING_FEATURES — match items to categories',
      '  • LABELLING — label a map or plan',
      'No passages needed',
    ],
  },
  'section 3': {
    title: 'Section 3: Academic Discussion',
    steps: [
      'Set skill to LISTENING, upload section audio',
      'Add question groups (typically 10 questions):',
      '  • MULTIPLE_CHOICE — choose correct answer',
      '  • MATCHING_FEATURES — match speakers to opinions',
      '  • SENTENCE_COMPLETION — complete sentences',
    ],
  },
  'section 4': {
    title: 'Section 4: Academic Lecture',
    steps: [
      'Set skill to LISTENING, upload section audio',
      'Add question groups (typically 10 questions):',
      '  • NOTE_COMPLETION or SUMMARY_COMPLETION',
      '  • SENTENCE_COMPLETION — complete sentences',
      '  • MULTIPLE_CHOICE (less common)',
    ],
  },
};

function SectionSetupGuide({
  examType,
  sectionTitle,
  onClose,
}: {
  examType: ExamType;
  sectionTitle: string;
  onClose: () => void;
}) {
  const titleLower = sectionTitle.toLowerCase();

  let guide: { title: string; steps: string[] } | null = null;
  const allGuides: { key: string; title: string; steps: string[] }[] = [];

  if (examType === 'TOEIC_LR') {
    for (const [key, val] of Object.entries(TOEIC_LR_GUIDE)) {
      allGuides.push({ key, title: val.title, steps: val.steps });
      if (titleLower.includes(key)) {
        guide = val;
      }
    }
  } else if (examType === 'TOEIC_SW' || examType === 'TOEIC_SPEAKING' || examType === 'TOEIC_WRITING') {
    const isSpeaking = examType === 'TOEIC_SPEAKING' || (examType === 'TOEIC_SW' && titleLower.includes('speaking'));
    const isWriting = examType === 'TOEIC_WRITING' || (examType === 'TOEIC_SW' && titleLower.includes('writing'));
    const guideMap = isWriting ? TOEIC_SW_WRITING_GUIDE : TOEIC_SW_SPEAKING_GUIDE;
    for (const [key, val] of Object.entries(guideMap)) {
      allGuides.push({ key, title: val.title, steps: val.steps });
      if (titleLower.includes(key)) {
        guide = val;
      }
    }
    // For combined TOEIC_SW, also show the other skill's guides
    if (examType === 'TOEIC_SW') {
      const otherMap = isSpeaking ? TOEIC_SW_WRITING_GUIDE : TOEIC_SW_SPEAKING_GUIDE;
      for (const [key, val] of Object.entries(otherMap)) {
        allGuides.push({ key, title: val.title, steps: val.steps });
      }
    }
  } else if (examType === 'IELTS_ACADEMIC' || examType === 'IELTS_GENERAL') {
    const isListening = titleLower.includes('listening') || titleLower.includes('listen');
    const guideMap = isListening ? IELTS_LISTENING_GUIDE : IELTS_READING_GUIDE;
    for (const [key, val] of Object.entries(guideMap)) {
      allGuides.push({ key, ...val });
      if (titleLower.includes(key)) {
        guide = val;
      }
    }
    const otherMap = isListening ? IELTS_READING_GUIDE : IELTS_LISTENING_GUIDE;
    for (const [key, val] of Object.entries(otherMap)) {
      allGuides.push({ key, ...val });
    }
  }

  return (
    <Card className="bg-blue-50/80 border-blue-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
            <Info className="h-4 w-4" />
            Setup Guide — {examType.replace('_', ' ')}
          </h4>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600 hover:bg-blue-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {guide ? (
          <div className="bg-white rounded-lg border border-blue-200 p-4">
            <h5 className="font-semibold text-sm text-blue-900 mb-2">{guide.title}</h5>
            <ol className="space-y-1.5">
              {guide.steps.map((step, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2">
                  {step.startsWith('  ') ? (
                    <span className="ml-6 text-slate-600">{step.trim()}</span>
                  ) : step.startsWith('⭐') ? (
                    <span className="text-amber-700 font-medium">{step}</span>
                  ) : (
                    <>
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-blue-700 mb-3 italic">
            No specific guide found for &ldquo;{sectionTitle}&rdquo;. Browse all sections below:
          </p>
        )}

        {!guide && allGuides.length > 0 && (
          <div className="space-y-2 mt-3">
            {allGuides.map(({ key, title, steps }) => (
              <details key={key} className="bg-white rounded-lg border border-blue-200">
                <summary className="px-4 py-2.5 text-sm font-medium text-blue-900 cursor-pointer hover:bg-blue-50/50">
                  {title}
                </summary>
                <div className="px-4 pb-3 pt-1">
                  <ol className="space-y-1.5">
                    {steps.map((step, i) => (
                      <li key={i} className="text-sm text-slate-700 flex gap-2">
                        {step.startsWith('  ') ? (
                          <span className="ml-6 text-slate-600">{step.trim()}</span>
                        ) : step.startsWith('⭐') ? (
                          <span className="text-amber-700 font-medium">{step}</span>
                        ) : (
                          <>
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span>{step}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        )}

        {allGuides.length > 0 && guide && (
          <details className="mt-3">
            <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800 font-medium">
              View all {examType.replace('_', ' ')} parts
            </summary>
            <div className="space-y-2 mt-2">
              {allGuides.filter((g) => g.title !== guide!.title).map(({ key, title, steps }) => (
                <details key={key} className="bg-white rounded-lg border border-blue-200">
                  <summary className="px-4 py-2.5 text-sm font-medium text-blue-900 cursor-pointer hover:bg-blue-50/50">
                    {title}
                  </summary>
                  <div className="px-4 pb-3 pt-1">
                    <ol className="space-y-1.5">
                      {steps.map((step, i) => (
                        <li key={i} className="text-sm text-slate-700 flex gap-2">
                          {step.startsWith('  ') ? (
                            <span className="ml-6 text-slate-600">{step.trim()}</span>
                          ) : step.startsWith('⭐') ? (
                            <span className="text-amber-700 font-medium">{step}</span>
                          ) : (
                            <>
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <span>{step}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                </details>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section Editor (local state) ─────────────────────

function SectionEditor({
  section,
  examType,
  sectionQuestionOffset,
  onChange,
  onDelete,
}: {
  section: AdminTestSection;
  examType: ExamType;
  sectionQuestionOffset: number;
  onChange: (updated: AdminTestSection) => void;
  onDelete: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [addGroupKey, setAddGroupKey] = useState(0);

  const skillCfg = SKILL_CONFIG[section.skill];

  function updateField(updates: Partial<AdminTestSection>) {
    onChange({ ...section, ...updates });
  }

  function handleAddGroup(questionType: QuestionType) {
    const newGroup: AdminQuestionGroup = {
      id: tempId(),
      sectionId: section.id,
      passageId: null,
      questionType,
      orderIndex: section.questionGroups.length,
      instructions: null,
      matchingOptions: null,
      audioUrl: null,
      imageUrl: null,
      imageSize: null,
      questions: [],
    };
    updateField({ questionGroups: [...section.questionGroups, newGroup] });
    setAddGroupKey((k) => k + 1);
    toast.success('Question group added (unsaved)');
  }

  function handleAddPassage() {
    const newPassage: AdminPassage = {
      id: tempId(),
      sectionId: section.id,
      title: `Passage-${crypto.randomUUID().slice(0, 8)}`,
      contentHtml: '',
      imageUrl: null,
      audioUrl: null,
      transcript: null,
      imageLayout: null,
      imageSize: null,
      images: null,
      orderIndex: (section.passages || []).length,
    };
    updateField({ passages: [...(section.passages || []), newPassage] });
    toast.success('Passage added (unsaved)');
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      {/* ─── Section Header ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Input
            value={section.title}
            onChange={(e) => updateField({ title: e.target.value })}
            className="h-10 text-base font-semibold w-72 bg-white"
          />
          <Badge className={cn('text-xs font-medium', skillCfg.bg, skillCfg.color, 'border', skillCfg.border)}>
            {section.skill}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {(section.questionGroups || []).reduce((s, g) => s + (g.questions?.length || 0), 0)} questions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGuide(!showGuide)}
            className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Info className="h-4 w-4" />
            {showGuide ? 'Hide Guide' : 'Setup Guide'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="gap-1.5"
          >
            <Settings2 className="h-4 w-4" />
            {showSettings ? 'Hide Settings' : 'Settings'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
            onClick={() => setDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete Section
          </Button>
        </div>
      </div>

      {/* ─── Setup Guide ─── */}
      {showGuide && (
        <SectionSetupGuide
          examType={examType}
          sectionTitle={section.title}
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* ─── Section Settings ─── */}
      {showSettings && (
        <Card className="bg-white">
          <CardContent className="p-5">
            <h4 className="text-sm font-semibold mb-4">Section Settings</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label className="text-sm font-medium">Instructions</Label>
                <Textarea
                  value={section.instructions || ''}
                  onChange={(e) => updateField({ instructions: e.target.value || null })}
                  className="mt-1.5"
                  rows={3}
                  placeholder="e.g. Questions 1-10. Listen and answer..."
                />
              </div>
              <div>
                <FileUpload
                  value={section.audioUrl || null}
                  onChange={(url) => updateField({ audioUrl: url || null })}
                  accept="audio/*"
                  label="Section Audio"
                  maxSizeMB={50}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Passages ─── */}
      {section.passages && section.passages.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-teal-700 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Passages
          </h4>
          {section.passages.map((passage) => (
            <PassageEditor
              key={passage.id}
              passage={passage}
              onChange={(updated) => {
                updateField({
                  passages: (section.passages || []).map((p) =>
                    p.id === passage.id ? updated : p,
                  ),
                });
              }}
              onDelete={() => {
                updateField({
                  passages: (section.passages || []).filter((p) => p.id !== passage.id),
                  // Clear passageId references in groups
                  questionGroups: section.questionGroups.map((g) =>
                    g.passageId === passage.id ? { ...g, passageId: null } : g,
                  ),
                });
                toast.success('Passage deleted (unsaved)');
              }}
            />
          ))}
        </div>
      )}

      {(section.skill === 'READING' || section.skill === 'LISTENING') && (
        <Button variant="outline" size="sm" onClick={handleAddPassage}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Passage
        </Button>
      )}

      {/* ─── Question Groups ─── */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Question Groups</h4>
          <Select key={addGroupKey} onValueChange={(val) => handleAddGroup(val as QuestionType)}>
            <SelectTrigger className="w-64 h-9 text-sm bg-white">
              <SelectValue placeholder="+ Add Question Group" />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map((qt) => (
                <SelectItem key={qt.value} value={qt.value} className="text-sm">
                  {qt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {section.questionGroups.length === 0 && (
          <Card className="bg-white border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <HelpCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">No question groups yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Select a question type above to add your first group
              </p>
            </CardContent>
          </Card>
        )}

        {section.questionGroups.map((group, gIdx) => {
          // Compute cumulative question offset: section offset + previous groups in this section
          const questionNumberOffset = sectionQuestionOffset + section.questionGroups
            .slice(0, gIdx)
            .reduce((sum, g) => sum + g.questions.length, 0);
          // Count how many groups are linked to each passage (informational)
          const passageGroupCounts = new Map<string, number>();
          for (const g of section.questionGroups) {
            if (g.passageId && g.id !== group.id) {
              passageGroupCounts.set(g.passageId, (passageGroupCounts.get(g.passageId) || 0) + 1);
            }
          }
          return (
            <QuestionGroupEditor
              key={group.id}
              group={group}
              passages={section.passages || []}
              passageGroupCounts={passageGroupCounts}
              questionNumberOffset={questionNumberOffset}
              isFirst={gIdx === 0}
              isLast={gIdx === section.questionGroups.length - 1}
              onChange={(updated) => {
                updateField({
                  questionGroups: section.questionGroups.map((g) =>
                    g.id === group.id ? updated : g,
                  ),
                });
              }}
              onMoveUp={() => {
                if (gIdx === 0) return;
                const groups = [...section.questionGroups];
                [groups[gIdx - 1], groups[gIdx]] = [groups[gIdx], groups[gIdx - 1]];
                updateField({ questionGroups: groups.map((g, i) => ({ ...g, orderIndex: i })) });
              }}
              onMoveDown={() => {
                if (gIdx === section.questionGroups.length - 1) return;
                const groups = [...section.questionGroups];
                [groups[gIdx], groups[gIdx + 1]] = [groups[gIdx + 1], groups[gIdx]];
                updateField({ questionGroups: groups.map((g, i) => ({ ...g, orderIndex: i })) });
              }}
              onDelete={() => {
                updateField({
                  questionGroups: section.questionGroups.filter((g) => g.id !== group.id),
                });
                toast.success('Group deleted (unsaved)');
              }}
            />
          );
        })}
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Delete Section"
        description={`Delete "${section.title}" and all its questions? This cannot be undone.`}
        onConfirm={onDelete}
        variant="danger"
      />
    </div>
  );
}

// ── Passage Editor (local state) ─────────────────────

function PassageEditor({
  passage,
  onChange,
  onDelete,
}: {
  passage: AdminPassage;
  onChange: (updated: AdminPassage) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showTranscript, setShowTranscript] = useState(!!passage.transcript);
  const [showContent, setShowContent] = useState(true);

  const isMultiImage = Array.isArray(passage.images);

  const handleSetSingleImage = () => {
    if (!isMultiImage) return;
    // Switch back to single image mode — keep first image if any
    const firstImage = passage.images?.[0];
    onChange({
      ...passage,
      images: null,
      imageUrl: firstImage?.url || null,
      imageLayout: firstImage?.layout || null,
      imageSize: firstImage?.size || 'medium',
    });
  };

  const handleSetMultiImage = () => {
    if (isMultiImage) return;
    // Switch to multi-image mode — move existing single image if any
    const initialImages = passage.imageUrl
      ? [{ url: passage.imageUrl, layout: passage.imageLayout || undefined, size: passage.imageSize || 'medium' }]
      : [];
    onChange({
      ...passage,
      images: initialImages,
      imageUrl: null,
      imageLayout: null,
      imageSize: null,
    });
  };

  const handleAddImage = () => {
    // Add an empty slot — will be filled by FileUpload
    onChange({ ...passage, images: [...(passage.images || []), { url: '', size: 'medium' }] });
  };

  const handleUpdateImage = (index: number, updates: Partial<{ url: string; layout?: string; size?: string }>) => {
    const updated = [...(passage.images || [])];
    updated[index] = { ...updated[index], ...updates };
    onChange({ ...passage, images: updated });
  };

  const handleRemoveImage = (index: number) => {
    const updated = (passage.images || []).filter((_, i) => i !== index);
    onChange({ ...passage, images: updated.length > 0 ? updated : null });
  };

  return (
    <Card className="bg-white border-teal-200">
      <CardContent className="p-0">
        <button
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-teal-50/50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <BookOpen className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-medium">{passage.title || 'Reading Passage'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(true); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
        {expanded && (
          <div className="px-5 pb-5 border-t">
            <div className="mt-4 mb-3">
              <Label className="text-sm font-medium">Passage Title</Label>
              <Input
                value={passage.title || ''}
                onChange={(e) => onChange({ ...passage, title: e.target.value || null })}
                className="mt-1 h-9 text-sm bg-white"
                placeholder="e.g. Reading Passage 1"
              />
            </div>

            {/* Image mode toggle */}
            <div className="flex items-center gap-2 mb-3">
              <Label className="text-xs text-muted-foreground">Image Mode:</Label>
              <button
                type="button"
                onClick={handleSetSingleImage}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  !isMultiImage
                    ? 'bg-teal-100 border-teal-300 text-teal-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={handleSetMultiImage}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  isMultiImage
                    ? 'bg-teal-100 border-teal-300 text-teal-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Multiple
              </button>
            </div>

            {/* Media uploads */}
            <div className="p-4 bg-teal-50/50 rounded-lg border border-teal-100 mb-3">
              {isMultiImage ? (
                /* Multi-image mode */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Passage Images ({passage.images?.length || 0})</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleAddImage}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Image
                    </Button>
                  </div>
                  {(passage.images || []).map((img, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-md border border-teal-100 relative">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500">Image {idx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleRemoveImage(idx)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <FileUpload
                        value={img.url || null}
                        onChange={(url) => handleUpdateImage(idx, { url: url || '' })}
                        accept="image/*"
                        label=""
                        maxSizeMB={10}
                      />
                      {img.url && (
                        <div className="mt-2">
                          <Label className="text-xs text-muted-foreground mb-1 block">Size</Label>
                          <div className="flex flex-wrap gap-3">
                            {(['small', 'medium', 'large', 'extra-large'] as const).map((sz) => (
                              <label key={sz} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input
                                  type="radio"
                                  name={`passage-multi-size-${passage.id}-${idx}`}
                                  checked={img.size === sz || (!img.size && sz === 'medium')}
                                  onChange={() => handleUpdateImage(idx, { size: sz })}
                                  className="accent-teal-600"
                                />
                                {sz.charAt(0).toUpperCase() + sz.slice(1).replace('-', ' ')}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Single-image mode (original) */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FileUpload
                      value={passage.imageUrl || null}
                      onChange={(url) => onChange({ ...passage, imageUrl: url || null, imageLayout: url ? (passage.imageLayout || 'vertical') : null, imageSize: url ? (passage.imageSize || 'medium') : null })}
                      accept="image/*"
                      label="Passage Image"
                      maxSizeMB={10}
                    />
                    {passage.imageUrl && (
                      <>
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground mb-1 block">Image Layout</Label>
                        <div className="flex flex-wrap gap-3">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`passage-layout-${passage.id}`}
                              checked={!passage.imageLayout || passage.imageLayout === 'vertical'}
                              onChange={() => onChange({ ...passage, imageLayout: 'vertical' })}
                              className="accent-teal-600"
                            />
                            Above text
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`passage-layout-${passage.id}`}
                              checked={passage.imageLayout === 'below-text'}
                              onChange={() => onChange({ ...passage, imageLayout: 'below-text' })}
                              className="accent-teal-600"
                            />
                            Below text
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`passage-layout-${passage.id}`}
                              checked={passage.imageLayout === 'beside-left'}
                              onChange={() => onChange({ ...passage, imageLayout: 'beside-left' })}
                              className="accent-teal-600"
                            />
                            Beside from left
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`passage-layout-${passage.id}`}
                              checked={passage.imageLayout === 'beside-right'}
                              onChange={() => onChange({ ...passage, imageLayout: 'beside-right' })}
                              className="accent-teal-600"
                            />
                            Beside from right
                          </label>
                        </div>
                      </div>
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground mb-1 block">Image Size</Label>
                        <div className="flex flex-wrap gap-3">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="radio" name={`passage-size-${passage.id}`} checked={passage.imageSize === 'small'} onChange={() => onChange({ ...passage, imageSize: 'small' })} className="accent-teal-600" />
                            Small
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="radio" name={`passage-size-${passage.id}`} checked={!passage.imageSize || passage.imageSize === 'medium'} onChange={() => onChange({ ...passage, imageSize: 'medium' })} className="accent-teal-600" />
                            Medium
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="radio" name={`passage-size-${passage.id}`} checked={passage.imageSize === 'large'} onChange={() => onChange({ ...passage, imageSize: 'large' })} className="accent-teal-600" />
                            Large
                          </label>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="radio" name={`passage-size-${passage.id}`} checked={passage.imageSize === 'extra-large'} onChange={() => onChange({ ...passage, imageSize: 'extra-large' })} className="accent-teal-600" />
                            Extra Large
                          </label>
                        </div>
                      </div>
                      </>
                    )}
                  </div>
                  <div>
                    <FileUpload
                      value={passage.audioUrl || null}
                      onChange={(url) => onChange({ ...passage, audioUrl: url || null })}
                      accept="audio/*"
                      label="Passage Audio"
                      maxSizeMB={50}
                    />
                  </div>
                </div>
              )}

              {/* Audio upload — always available regardless of image mode */}
              {isMultiImage && (
                <div className="mt-4 pt-4 border-t border-teal-100">
                  <FileUpload
                    value={passage.audioUrl || null}
                    onChange={(url) => onChange({ ...passage, audioUrl: url || null })}
                    accept="audio/*"
                    label="Passage Audio"
                    maxSizeMB={50}
                  />
                </div>
              )}
            </div>

            {/* Transcript editor — shown when passage has audio */}
            {passage.audioUrl && (
              <div className="mt-3 border rounded-md border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {showTranscript ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Audio Transcript
                </button>
                {showTranscript && (
                  <div className="p-2 border-t border-slate-200">
                    <TiptapEditor
                      content={passage.transcript || ''}
                      onChange={(html) => onChange({ ...passage, transcript: html })}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 border rounded-md border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowContent(!showContent)}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {showContent ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Passage Content
              </button>
              {showContent && (
                <div className="p-2 border-t border-slate-200">
                  <TiptapEditor
                    content={passage.contentHtml}
                    onChange={(html) => onChange({ ...passage, contentHtml: html })}
                    placeholder="Enter passage text here..."
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Delete Passage"
        description="Delete this passage? Groups linked to it will be unlinked."
        onConfirm={onDelete}
        variant="danger"
      />
    </Card>
  );
}

// ── Parse blank numbers from passage HTML ────────────

function parseBlanksFromHtml(html: string): number[] {
  const blanks: number[] = [];
  // Match ___N___ patterns (3+ underscores, number, 3+ underscores)
  const regex = /_{2,}\s*(\d+)\s*_{2,}/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    blanks.push(parseInt(match[1], 10));
  }
  // Also match {N} style placeholders
  const regex2 = /\{(\d+)\}/g;
  while ((match = regex2.exec(html)) !== null) {
    const num = parseInt(match[1], 10);
    if (!blanks.includes(num)) blanks.push(num);
  }
  return blanks.sort((a, b) => a - b);
}

// ── Question Group Editor (local state) ──────────────

function QuestionGroupEditor({
  group,
  passages,
  passageGroupCounts,
  questionNumberOffset,
  isFirst,
  isLast,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  group: AdminQuestionGroup;
  passages: AdminPassage[];
  passageGroupCounts: Map<string, number>;
  questionNumberOffset: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (updated: AdminQuestionGroup) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const isTableOrForm = group.questionType === 'TABLE_COMPLETION' || group.questionType === 'FORM_COMPLETION';
  const [showInstructions, setShowInstructions] = useState(!!group.instructions || isTableOrForm);

  const qtLabel = QUESTION_TYPES.find((q) => q.value === group.questionType)?.label || group.questionType;
  const isNoteCompletion = group.questionType === 'NOTE_COMPLETION' || group.questionType === 'TABLE_COMPLETION' || group.questionType === 'FORM_COMPLETION';
  const linkedPassage = passages.find((p) => p.id === group.passageId);

  function handleSyncFromPassage() {
    if (!linkedPassage) return;
    const blankNumbers = parseBlanksFromHtml(linkedPassage.contentHtml);
    if (blankNumbers.length === 0) {
      toast.error('No blanks found in passage. Use ___1___, ___2___ or {1}, {2} syntax.');
      return;
    }

    // Build new questions list, preserving existing ones by questionNumber
    const existingByNumber = new Map(
      group.questions.filter((q) => q.questionNumber > 0).map((q) => [q.questionNumber, q]),
    );

    const syncedQuestions: AdminQuestion[] = blankNumbers.map((num, idx) => {
      const existing = existingByNumber.get(num);
      if (existing) {
        return { ...existing, orderIndex: idx };
      }
      return {
        id: tempId(),
        groupId: group.id,
        questionNumber: num,
        orderIndex: idx,
        stem: '',
        options: null,
        correctAnswer: '',
        explanation: null,
        imageUrl: null,
        audioUrl: null,
        transcript: null,
        imageLayout: null,
        imageSize: null,
      };
    });

    onChange({ ...group, questions: syncedQuestions });
    toast.success(`Synced ${blankNumbers.length} blanks from passage`);
  }

  function handleAddQuestion() {
    const newQ: AdminQuestion = {
      id: tempId(),
      groupId: group.id,
      questionNumber: 0, // Will be renumbered
      orderIndex: group.questions.length,
      stem: '',
      options: null,
      correctAnswer: '',
      explanation: null,
      imageUrl: null,
      audioUrl: null,
      transcript: null,
      imageLayout: null,
      imageSize: null,
    };

    if (group.questionType === 'MULTIPLE_CHOICE') {
      newQ.options = [
        { label: 'A', text: '' },
        { label: 'B', text: '' },
        { label: 'C', text: '' },
        { label: 'D', text: '' },
      ];
    } else if (group.questionType === 'TRUE_FALSE_NOT_GIVEN') {
      newQ.options = [
        { label: 'TRUE', text: 'TRUE' },
        { label: 'FALSE', text: 'FALSE' },
        { label: 'NOT GIVEN', text: 'NOT GIVEN' },
      ];
    } else if (group.questionType === 'YES_NO_NOT_GIVEN') {
      newQ.options = [
        { label: 'YES', text: 'YES' },
        { label: 'NO', text: 'NO' },
        { label: 'NOT GIVEN', text: 'NOT GIVEN' },
      ];
    } else if (group.questionType === 'SENTENCE_REORDER') {
      newQ.metadata = { type: 'SENTENCE_REORDER', fragments: [], hskLevel: 5, charSet: 'simplified' };
      newQ.correctAnswer = '';
    } else if (group.questionType === 'KEYWORD_COMPOSITION') {
      newQ.metadata = { type: 'KEYWORD_COMPOSITION', keywords: [], minChars: 60, maxChars: 100, hskLevel: 5 };
      newQ.correctAnswer = '';
      newQ.stem = '请结合下列词语（要全部使用，顺序不分先后），写一篇80字左右的短文。';
    } else if (group.questionType === 'PICTURE_COMPOSITION') {
      newQ.metadata = { type: 'PICTURE_COMPOSITION', minChars: 60, maxChars: 100, hskLevel: 5 };
      newQ.correctAnswer = '';
      newQ.stem = '请结合这张图片写一篇80字左右的短文。';
    } else if (group.questionType === 'WRITE_SENTENCES') {
      newQ.metadata = { type: 'WRITE_SENTENCES', keywords: [], timeLimit: 90 };
      newQ.correctAnswer = '';
      newQ.stem = '';
    } else if (group.questionType === 'RESPOND_WRITTEN_REQUEST') {
      newQ.metadata = { type: 'RESPOND_WRITTEN_REQUEST', minWords: 50, maxWords: 120, timeLimit: 600 };
      newQ.correctAnswer = '';
      newQ.stem = '';
    } else if (group.questionType === 'WRITE_OPINION_ESSAY') {
      newQ.metadata = { type: 'WRITE_OPINION_ESSAY', minWords: 300, timeLimit: 1800 };
      newQ.correctAnswer = '';
      newQ.stem = '';
    } else if (['READ_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_TO_QUESTIONS', 'PROPOSE_SOLUTION', 'EXPRESS_OPINION'].includes(group.questionType)) {
      const speakingDefaults: Record<string, { prepTime: number; responseTime: number }> = {
        READ_ALOUD: { prepTime: 45, responseTime: 45 },
        DESCRIBE_PICTURE: { prepTime: 45, responseTime: 45 },
        RESPOND_TO_QUESTIONS: { prepTime: 0, responseTime: 15 },
        PROPOSE_SOLUTION: { prepTime: 45, responseTime: 60 },
        EXPRESS_OPINION: { prepTime: 30, responseTime: 60 },
      };
      newQ.metadata = { type: group.questionType, ...speakingDefaults[group.questionType] };
      newQ.correctAnswer = '';
      newQ.stem = '';
    }

    onChange({ ...group, questions: [...group.questions, newQ] });
    toast.success('Question added (unsaved)');
  }

  return (
    <Card className="bg-white shadow-sm overflow-hidden">
      {/* Group Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b">
        <button
          className="flex items-center gap-3"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Badge variant="outline" className="text-sm px-3 py-1 bg-white font-medium">
            {qtLabel}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {group.questions.length} question{group.questions.length !== 1 ? 's' : ''}
          </span>
        </button>
        <div className="flex items-center gap-2">
          {passages.length > 0 && (
            <Select
              value={group.passageId || 'none'}
              onValueChange={(val) => {
                onChange({ ...group, passageId: val === 'none' ? null : val });
              }}
            >
              <SelectTrigger className="w-48 h-8 text-xs bg-white">
                <SelectValue placeholder="Link to passage..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No passage</SelectItem>
                {passages.map((p, i) => {
                  const linkedCount = passageGroupCounts.get(p.id) || 0;
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title || `Passage ${i + 1}`}
                      {linkedCount > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">({linkedCount} group{linkedCount > 1 ? 's' : ''})</span>}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          {!isNoteCompletion && !showInstructions && !group.instructions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 text-muted-foreground"
              onClick={() => setShowInstructions(true)}
            >
              <FileText className="h-3.5 w-3.5" /> Instructions
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 bg-white"
            onClick={handleAddQuestion}
          >
            <Plus className="h-4 w-4" /> Add Question
          </Button>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isFirst}
              onClick={onMoveUp}
              title="Move group up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isLast}
              onClick={onMoveDown}
              title="Move group down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-red-400 hover:text-red-600 hover:bg-red-50"
            onClick={() => setDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Group Info */}
      {expanded && (group.instructions || group.audioUrl || group.imageUrl || showInstructions) && (
        <div className="px-5 py-3 bg-blue-50/50 border-b space-y-2">
          {(showInstructions || group.instructions) && (
            <div>
              <Label className="text-xs font-medium text-muted-foreground">
                Instructions
                {(group.questionType === 'TABLE_COMPLETION' || group.questionType === 'FORM_COMPLETION') && (
                  <span className="ml-2 text-[10px] font-normal text-amber-600">
                    Use the table tool to build your table, then type ___1___, ___2___ etc. for blanks
                  </span>
                )}
              </Label>
              <div className="mt-1">
                <TiptapEditor
                  content={group.instructions || ''}
                  onChange={(html) => onChange({ ...group, instructions: html || null })}
                  placeholder={
                    group.questionType === 'TABLE_COMPLETION' || group.questionType === 'FORM_COMPLETION'
                      ? 'Build your table here with ___1___, ___2___ for blanks...'
                      : 'e.g. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.'
                  }
                />
              </div>
            </div>
          )}
          {group.audioUrl && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Music className="h-4 w-4 shrink-0" />
              <span className="truncate">{group.audioUrl}</span>
            </div>
          )}
          {group.imageUrl && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image className="h-4 w-4 shrink-0" />
              <span className="truncate">{group.imageUrl}</span>
            </div>
          )}
        </div>
      )}

      {/* Note/Form Completion: Sync from Passage */}
      {expanded && isNoteCompletion && (
        <div className="px-5 py-3 bg-amber-50/50 border-b flex items-center justify-between gap-3">
          <div className="text-xs text-amber-700">
            {linkedPassage
              ? <>Linked to: <strong>{linkedPassage.title || 'Passage'}</strong> — use <code className="bg-amber-100 px-1 rounded">___1___</code> or <code className="bg-amber-100 px-1 rounded">{'{1}'}</code> syntax for blanks</>
              : 'Link this group to a passage, then use Sync to auto-create questions from blanks.'
            }
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!showInstructions && !group.instructions && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  setShowInstructions(true);
                  onChange({ ...group, instructions: 'Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.' });
                }}
              >
                <FileText className="h-3.5 w-3.5" /> Add Instructions
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={handleSyncFromPassage}
              disabled={!linkedPassage}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Sync from Passage
            </Button>
          </div>
        </div>
      )}

      {/* Questions */}
      {expanded && (
        <div>
          {group.questions.length === 0 ? (
            <div className="px-5 py-10 text-center text-muted-foreground">
              <p className="text-sm">No questions yet.</p>
              <button
                className="text-sm text-indigo-600 hover:underline font-medium mt-1"
                onClick={handleAddQuestion}
              >
                Add your first question
              </button>
            </div>
          ) : (
            <div>
              {group.questions.map((question, idx) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  questionType={group.questionType}
                  displayNumber={questionNumberOffset + idx + 1}
                  isLast={idx === group.questions.length - 1}
                  onChange={(updated) => {
                    onChange({
                      ...group,
                      questions: group.questions.map((q) =>
                        q.id === question.id ? updated : q,
                      ),
                    });
                  }}
                  onDelete={() => {
                    onChange({
                      ...group,
                      questions: group.questions.filter((q) => q.id !== question.id),
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Delete Question Group"
        description={`Delete this ${qtLabel} group and its ${group.questions.length} questions?`}
        onConfirm={onDelete}
        variant="danger"
      />
    </Card>
  );
}

// ── Individual Question Editor (local state) ─────────

function QuestionEditor({
  question,
  questionType,
  displayNumber,
  isLast,
  onChange,
  onDelete,
}: {
  question: AdminQuestion;
  questionType: QuestionType;
  displayNumber: number;
  isLast: boolean;
  onChange: (updated: AdminQuestion) => void;
  onDelete: () => void;
}) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [showMedia, setShowMedia] = useState(!!(question.imageUrl || question.audioUrl));
  const [showTranscript, setShowTranscript] = useState(!!question.transcript);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isMCQ = questionType === 'MULTIPLE_CHOICE';
  const isTFNG = questionType === 'TRUE_FALSE_NOT_GIVEN';
  const isYNNG = questionType === 'YES_NO_NOT_GIVEN';
  const isMatching = questionType.startsWith('MATCHING_');
  const isCompletion = ['SENTENCE_COMPLETION', 'SUMMARY_COMPLETION', 'NOTE_COMPLETION', 'TABLE_COMPLETION', 'FORM_COMPLETION', 'SHORT_ANSWER'].includes(questionType);
  const isSentenceReorder = questionType === 'SENTENCE_REORDER';
  const isKeywordComp = questionType === 'KEYWORD_COMPOSITION';
  const isPictureComp = questionType === 'PICTURE_COMPOSITION';
  const isHskWriting = isSentenceReorder || isKeywordComp || isPictureComp;
  const isToeicWriteSentences = questionType === 'WRITE_SENTENCES';
  const isToeicRespondRequest = questionType === 'RESPOND_WRITTEN_REQUEST';
  const isToeicOpinionEssay = questionType === 'WRITE_OPINION_ESSAY';
  const isToeicWriting = isToeicWriteSentences || isToeicRespondRequest || isToeicOpinionEssay;
  const isToeicSpeaking = ['READ_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_TO_QUESTIONS', 'PROPOSE_SOLUTION', 'EXPRESS_OPINION'].includes(questionType);

  return (
    <div className={cn(
      'px-5 py-5 group hover:bg-slate-50/80 transition-colors',
      !isLast && 'border-b',
    )}>
      <div className="flex items-start gap-4">
        {/* Question Number */}
        <div className="shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
          {displayNumber}
        </div>

        {/* Question Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Stem */}
          {(isMCQ || isTFNG || isYNNG || !isCompletion) && !isToeicSpeaking && !isToeicWriting && !isHskWriting && (
            <Input
              value={question.stem || ''}
              onChange={(e) => onChange({ ...question, stem: e.target.value })}
              placeholder="Enter question text..."
              className="h-11 text-base bg-white"
            />
          )}

          {/* MCQ Options */}
          {isMCQ && Array.isArray(question.options) && (
            <div className="space-y-2.5 pl-1">
              {question.options.map((opt: { label: string; text: string }, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <button
                    className={cn(
                      'w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-all',
                      question.correctAnswer === opt.label
                        ? 'border-green-500 bg-green-50 text-green-700 shadow-sm shadow-green-200'
                        : 'border-gray-300 hover:border-indigo-400 text-gray-500',
                    )}
                    onClick={() => onChange({ ...question, correctAnswer: opt.label })}
                    title={`Set ${opt.label} as correct answer`}
                  >
                    {opt.label}
                  </button>
                  <Input
                    value={opt.text}
                    onChange={(e) => {
                      const newOpts = [...(question.options || [])];
                      newOpts[i] = { ...opt, text: e.target.value };
                      onChange({ ...question, options: newOpts });
                    }}
                    placeholder={`Option ${opt.label}`}
                    className="h-10 text-sm bg-white"
                  />
                  {question.options && question.options.length > 2 && (
                    <button
                      className="w-7 h-7 rounded-full border border-gray-300 hover:border-red-400 hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center text-sm shrink-0 transition-all"
                      onClick={() => {
                        const newOpts = (question.options || [])
                          .filter((_: { label: string; text: string }, idx: number) => idx !== i)
                          .map((o: { label: string; text: string }, idx: number) => ({ ...o, label: String.fromCharCode(65 + idx) }));
                        const updated = { ...question, options: newOpts } as AdminQuestion;
                        // Clear correctAnswer if the removed option was selected, or re-map it
                        if (question.correctAnswer === opt.label) {
                          updated.correctAnswer = '';
                        } else {
                          const oldIdx = (question.options || []).findIndex((o: { label: string }) => o.label === question.correctAnswer);
                          if (oldIdx > i) {
                            updated.correctAnswer = String.fromCharCode(65 + oldIdx - 1);
                          }
                        }
                        onChange(updated);
                      }}
                      title="Remove option"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {question.options.length < 6 && (
                <button
                  className="ml-11 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 hover:border-indigo-400 text-xs text-gray-500 hover:text-indigo-600 transition-all"
                  onClick={() => {
                    const newLabel = String.fromCharCode(65 + (question.options || []).length);
                    const newOpts = [...(question.options || []), { label: newLabel, text: '' }];
                    onChange({ ...question, options: newOpts });
                  }}
                >
                  + Add option
                </button>
              )}
            </div>
          )}

          {/* TFNG / YNNG */}
          {(isTFNG || isYNNG) && (
            <div className="flex gap-2.5">
              {(isTFNG ? ['TRUE', 'FALSE', 'NOT GIVEN'] : ['YES', 'NO', 'NOT GIVEN']).map((val) => (
                <button
                  key={val}
                  className={cn(
                    'px-5 py-2.5 rounded-lg text-sm font-medium border-2 transition-all',
                    question.correctAnswer === val
                      ? 'bg-green-50 border-green-500 text-green-700 shadow-sm shadow-green-200'
                      : 'border-gray-200 hover:border-indigo-400 text-muted-foreground bg-white',
                  )}
                  onClick={() => onChange({ ...question, correctAnswer: val })}
                >
                  {val}
                </button>
              ))}
            </div>
          )}

          {/* Completion / Short Answer / Matching */}
          {(isCompletion || isMatching) && (
            <div className="flex items-center gap-4">
              {isCompletion && (
                <Input
                  value={question.stem || ''}
                  onChange={(e) => onChange({ ...question, stem: e.target.value })}
                  placeholder="Question text / blank..."
                  className="h-11 text-base flex-1 bg-white"
                />
              )}
              <div className="shrink-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap font-medium">Answer:</Label>
                  <Input
                    value={question.correctAnswer}
                    onChange={(e) => onChange({ ...question, correctAnswer: e.target.value })}
                    placeholder="e.g. TWO/2 or (THE) BANK [OR] BANK"
                    className="h-10 text-sm w-72 bg-white font-mono"
                  />
                  <details className="relative">
                    <summary className="cursor-pointer list-none">
                      <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    </summary>
                    <div className="absolute right-0 top-6 z-50 w-72 rounded-lg border bg-white p-3 shadow-lg text-xs space-y-1.5">
                      <p className="font-semibold text-sm">Answer syntax</p>
                      <p><code className="bg-slate-100 px-1 rounded">/</code> alternative forms: <code className="bg-slate-100 px-1 rounded">TWO/2</code></p>
                      <p><code className="bg-slate-100 px-1 rounded">(text)</code> optional part: <code className="bg-slate-100 px-1 rounded">(THE) BANK</code></p>
                      <p><code className="bg-slate-100 px-1 rounded">(A/B)</code> optional alternatives: <code className="bg-slate-100 px-1 rounded">10 (A.M./AM)</code></p>
                      <p><code className="bg-slate-100 px-1 rounded">[OR]</code> different answers: <code className="bg-slate-100 px-1 rounded">CAR [OR] BUS</code></p>
                      <p className="text-muted-foreground">Case-insensitive. Hyphens = spaces. Dots ignored.</p>
                    </div>
                  </details>
                </div>
                {question.correctAnswer && (question.correctAnswer.includes('[OR]') || question.correctAnswer.includes('/') || question.correctAnswer.includes('(')) && (
                  <div className="flex flex-wrap gap-1 ml-[3.5rem]">
                    {getAcceptedForms(question.correctAnswer).map((form) => (
                      <span key={form} className="inline-block px-1.5 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                        {form}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HSK Sentence Reorder */}
          {isSentenceReorder && (
            <div className="space-y-3 p-4 bg-red-50/50 rounded-lg border border-red-200">
              <div>
                <Label className="text-sm font-medium">Fragments (one per line)</Label>
                <Textarea
                  value={((question.metadata as Record<string, unknown>)?.fragments as string[] || []).join('\n')}
                  onChange={(e) => {
                    const fragments = e.target.value.split('\n').filter(Boolean);
                    onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), fragments } });
                  }}
                  placeholder="结果将在&#10;公布&#10;月底&#10;录取"
                  rows={4}
                  className="text-sm bg-white mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Correct Sentence</Label>
                <Input
                  value={question.correctAnswer || ''}
                  onChange={(e) => onChange({ ...question, correctAnswer: e.target.value })}
                  placeholder="录取结果将在月底公布"
                  className="h-10 text-sm bg-white mt-1"
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-sm font-medium">HSK Level</Label>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={((question.metadata as Record<string, unknown>)?.hskLevel as number) || 5}
                    onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), hskLevel: parseInt(e.target.value) || 5 } })}
                    className="h-10 w-20 text-sm bg-white mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* HSK Keyword Composition */}
          {isKeywordComp && (
            <div className="space-y-3 p-4 bg-red-50/50 rounded-lg border border-red-200">
              <div>
                <Label className="text-sm font-medium">Prompt (stem)</Label>
                <Textarea
                  value={question.stem || ''}
                  onChange={(e) => onChange({ ...question, stem: e.target.value })}
                  placeholder="请结合下列词语（要全部使用，顺序不分先后），写一篇80字左右的短文。"
                  rows={2}
                  className="text-sm bg-white mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Keywords (comma-separated)</Label>
                <Input
                  value={((question.metadata as Record<string, unknown>)?.keywords as string[] || []).join(', ')}
                  onChange={(e) => {
                    const keywords = e.target.value.split(/[,，]/).map(k => k.trim()).filter(Boolean);
                    onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), keywords } });
                  }}
                  placeholder="博物馆, 保存, 讲解员, 丰富, 值得"
                  className="h-10 text-sm bg-white mt-1"
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-sm font-medium">Min Chars</Label>
                  <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.minChars as number) || 60} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), minChars: parseInt(e.target.value) || 60 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Max Chars</Label>
                  <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.maxChars as number) || 100} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), maxChars: parseInt(e.target.value) || 100 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">HSK Level</Label>
                  <Input type="number" min={1} max={6} value={((question.metadata as Record<string, unknown>)?.hskLevel as number) || 5} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), hskLevel: parseInt(e.target.value) || 5 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
              </div>
              <p className="text-xs text-amber-600 font-medium">⚠ No correctAnswer — this question is AI-graded</p>
            </div>
          )}

          {/* HSK Picture Composition */}
          {isPictureComp && (
            <div className="space-y-3 p-4 bg-red-50/50 rounded-lg border border-red-200">
              <div>
                <Label className="text-sm font-medium">Prompt (stem)</Label>
                <Textarea
                  value={question.stem || ''}
                  onChange={(e) => onChange({ ...question, stem: e.target.value })}
                  placeholder="请结合这张图片写一篇80字左右的短文。"
                  rows={2}
                  className="text-sm bg-white mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Image Alt Text</Label>
                <Input
                  value={((question.metadata as Record<string, unknown>)?.imageAlt as string) || ''}
                  onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), imageAlt: e.target.value } })}
                  placeholder="Description of the image for AI context"
                  className="h-10 text-sm bg-white mt-1"
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-sm font-medium">Min Chars</Label>
                  <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.minChars as number) || 60} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), minChars: parseInt(e.target.value) || 60 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Max Chars</Label>
                  <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.maxChars as number) || 100} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), maxChars: parseInt(e.target.value) || 100 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">HSK Level</Label>
                  <Input type="number" min={1} max={6} value={((question.metadata as Record<string, unknown>)?.hskLevel as number) || 5} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), hskLevel: parseInt(e.target.value) || 5 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
              </div>
              <p className="text-xs text-amber-600 font-medium">⚠ No correctAnswer — this question is AI-graded</p>
            </div>
          )}

          {/* TOEIC Writing: Write Sentences */}
          {isToeicWriteSentences && (
            <div className="space-y-3 p-4 bg-blue-50/50 rounded-lg border border-blue-200">
              <div>
                <Label className="text-sm font-medium">Instructions (stem)</Label>
                <Textarea
                  value={question.stem || ''}
                  onChange={(e) => onChange({ ...question, stem: e.target.value })}
                  placeholder="Write ONE sentence based on the picture. Use the TWO words or phrases given."
                  rows={2}
                  className="text-sm bg-white mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Keywords (comma-separated)</Label>
                <Input
                  value={((question.metadata as Record<string, unknown>)?.keywords as string[])?.join(', ') || ''}
                  onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) } })}
                  placeholder="e.g. meeting, schedule"
                  className="h-10 text-sm bg-white mt-1"
                />
              </div>
              <p className="text-xs text-amber-600 font-medium">⚠ AI-graded — upload image via Media section below</p>
            </div>
          )}

          {/* TOEIC Writing: Respond to Written Request */}
          {isToeicRespondRequest && (
            <div className="space-y-3 p-4 bg-blue-50/50 rounded-lg border border-blue-200">
              <div>
                <Label className="text-sm font-medium">Email/Letter Content (stem - supports HTML)</Label>
                <Textarea
                  value={question.stem || ''}
                  onChange={(e) => onChange({ ...question, stem: e.target.value })}
                  placeholder="Dear Mr./Ms. ..."
                  rows={6}
                  className="text-sm bg-white mt-1"
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-sm font-medium">Min Words</Label>
                  <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.minWords as number) || 50} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), minWords: parseInt(e.target.value) || 50 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Max Words</Label>
                  <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.maxWords as number) || 120} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), maxWords: parseInt(e.target.value) || 120 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
              </div>
              <p className="text-xs text-amber-600 font-medium">⚠ AI-graded — no correctAnswer needed</p>
            </div>
          )}

          {/* TOEIC Writing: Opinion Essay */}
          {isToeicOpinionEssay && (
            <div className="space-y-3 p-4 bg-blue-50/50 rounded-lg border border-blue-200">
              <div>
                <Label className="text-sm font-medium">Essay Prompt (stem)</Label>
                <Textarea
                  value={question.stem || ''}
                  onChange={(e) => onChange({ ...question, stem: e.target.value })}
                  placeholder="Do you agree or disagree with the following statement? ..."
                  rows={4}
                  className="text-sm bg-white mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Min Words</Label>
                <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.minWords as number) || 300} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), minWords: parseInt(e.target.value) || 300 } })} className="h-10 w-24 text-sm bg-white mt-1" />
              </div>
              <p className="text-xs text-amber-600 font-medium">⚠ AI-graded — no correctAnswer needed</p>
            </div>
          )}

          {/* TOEIC Speaking question types */}
          {isToeicSpeaking && (
            <div className="space-y-3 p-4 bg-red-50/50 rounded-lg border border-red-200">
              {questionType === 'READ_ALOUD' && (
                <div>
                  <Label className="text-sm font-medium">Instruction line</Label>
                  <Input
                    value={((question.metadata as Record<string, unknown>)?.instruction as string) || 'Read the text aloud'}
                    onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), instruction: e.target.value } })}
                    placeholder="e.g. Read the text aloud"
                    className="h-10 text-sm bg-white mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">Displayed as a separate title above the passage</p>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">
                  {questionType === 'READ_ALOUD' ? 'Text Passage (stem)' :
                   questionType === 'DESCRIBE_PICTURE' ? 'Instructions (stem)' :
                   'Question / Prompt (stem)'}
                </Label>
                <div className="mt-1">
                  <TiptapMiniEditor
                    content={question.stem || ''}
                    onChange={(html) => onChange({ ...question, stem: html })}
                    placeholder={questionType === 'READ_ALOUD' ? 'Enter the text passage to be read aloud...' : 'Enter the question or prompt...'}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-sm font-medium">Prep Time (sec)</Label>
                  <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.prepTime as number) || 0} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), prepTime: parseInt(e.target.value) || 0 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Response Time (sec)</Label>
                  <Input type="number" min={0} value={((question.metadata as Record<string, unknown>)?.responseTime as number) || 45} onChange={(e) => onChange({ ...question, metadata: { ...(question.metadata as Record<string, unknown> || {}), responseTime: parseInt(e.target.value) || 45 } })} className="h-10 w-20 text-sm bg-white mt-1" />
                </div>
              </div>
              <p className="text-xs text-amber-600 font-medium">⚠ Speaking question — graded via audio recording + AI</p>
            </div>
          )}

          {/* Media & Explanation toggles */}
          <div className="flex items-center gap-1 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-xs gap-1.5 rounded-md',
                showMedia ? 'text-indigo-600' : 'text-muted-foreground',
              )}
              onClick={() => setShowMedia(!showMedia)}
            >
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image className="h-3.5 w-3.5" />
              Media
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-xs gap-1.5 rounded-md',
                showExplanation ? 'text-indigo-600' : 'text-muted-foreground',
              )}
              onClick={() => setShowExplanation(!showExplanation)}
            >
              <FileText className="h-3.5 w-3.5" />
              Explanation
            </Button>
          </div>

          {/* Media fields */}
          {showMedia && (<>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border">
              <div>
                <FileUpload
                  value={question.imageUrl || null}
                  onChange={(url) => onChange({ ...question, imageUrl: url || null, imageLayout: url ? (question.imageLayout || 'vertical') : null, imageSize: url ? (question.imageSize || 'medium') : null })}
                  accept="image/*"
                  label="Question Image"
                  maxSizeMB={10}
                />
                {question.imageUrl && (
                  <>
                  <div className="mt-2">
                    <Label className="text-xs text-muted-foreground mb-1 block">Image Layout</Label>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`question-layout-${question.id}`}
                          checked={!question.imageLayout || question.imageLayout === 'vertical'}
                          onChange={() => onChange({ ...question, imageLayout: 'vertical' })}
                          className="accent-indigo-600"
                        />
                        Above text
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`question-layout-${question.id}`}
                          checked={question.imageLayout === 'below-text'}
                          onChange={() => onChange({ ...question, imageLayout: 'below-text' })}
                          className="accent-indigo-600"
                        />
                        Below text
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`question-layout-${question.id}`}
                          checked={question.imageLayout === 'beside-left'}
                          onChange={() => onChange({ ...question, imageLayout: 'beside-left' })}
                          className="accent-indigo-600"
                        />
                        Beside left
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`question-layout-${question.id}`}
                          checked={question.imageLayout === 'beside-right'}
                          onChange={() => onChange({ ...question, imageLayout: 'beside-right' })}
                          className="accent-indigo-600"
                        />
                        Beside right
                      </label>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Label className="text-xs text-muted-foreground mb-1 block">Image Size</Label>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" name={`question-size-${question.id}`} checked={question.imageSize === 'small'} onChange={() => onChange({ ...question, imageSize: 'small' })} className="accent-indigo-600" />
                        Small
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" name={`question-size-${question.id}`} checked={!question.imageSize || question.imageSize === 'medium'} onChange={() => onChange({ ...question, imageSize: 'medium' })} className="accent-indigo-600" />
                        Medium
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" name={`question-size-${question.id}`} checked={question.imageSize === 'large'} onChange={() => onChange({ ...question, imageSize: 'large' })} className="accent-indigo-600" />
                        Large
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" name={`question-size-${question.id}`} checked={question.imageSize === 'extra-large'} onChange={() => onChange({ ...question, imageSize: 'extra-large' })} className="accent-indigo-600" />
                        Extra Large
                      </label>
                    </div>
                  </div>
                  </>
                )}
              </div>
              <div>
                <FileUpload
                  value={question.audioUrl || null}
                  onChange={(url) => onChange({ ...question, audioUrl: url || null })}
                  accept="audio/*"
                  label="Question Audio"
                  maxSizeMB={50}
                />
              </div>
            </div>
            {/* Transcript editor — shown when question has audio */}
            {question.audioUrl && (
              <div className="mt-3 border rounded-md border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {showTranscript ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Audio Transcript
                </button>
                {showTranscript && (
                  <div className="p-2 border-t border-slate-200">
                    <TiptapMiniEditor
                      content={question.transcript || ''}
                      onChange={(html) => {
                        const isEmpty = html === '<p></p>' || html === '';
                        onChange({ ...question, transcript: isEmpty ? null : html });
                      }}
                      placeholder="Audio transcript text..."
                    />
                  </div>
                )}
              </div>
            )}
          </>)}

          {/* Explanation */}
          {showExplanation && (
            <div className="p-4 bg-slate-50 rounded-lg border">
              <TiptapMiniEditor
                content={question.explanation || ''}
                onChange={(html) => {
                  const isEmpty = html === '<p></p>' || html === '';
                  onChange({ ...question, explanation: isEmpty ? null : html });
                }}
                placeholder="Explanation (shown after submission)..."
              />
            </div>
          )}
        </div>

        {/* Delete button */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-opacity"
            onClick={() => setDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Delete Question"
        description={`Delete question #${displayNumber}?`}
        onConfirm={onDelete}
        variant="danger"
      />
    </div>
  );
}
