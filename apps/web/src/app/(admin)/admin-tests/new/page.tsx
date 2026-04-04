'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, Headphones, Pen, Mic, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCreateFromTemplate } from '@/features/admin/hooks/use-admin-tests';
import type { ExamType, SectionSkill } from '@/features/admin/types';

const EXAM_TYPES = [
  {
    value: 'IELTS_ACADEMIC' as ExamType,
    label: 'IELTS Academic',
    description: 'International English Language Testing System — Academic module',
    color: 'bg-indigo-50 border-indigo-200 hover:border-indigo-400',
    activeColor: 'bg-indigo-100 border-indigo-500 ring-2 ring-indigo-200',
    needsSkill: true,
  },
  {
    value: 'IELTS_GENERAL' as ExamType,
    label: 'IELTS General Training',
    description: 'International English Language Testing System — General Training module',
    color: 'bg-teal-50 border-teal-200 hover:border-teal-400',
    activeColor: 'bg-teal-100 border-teal-500 ring-2 ring-teal-200',
    needsSkill: true,
  },
  {
    value: 'TOEIC_LR' as ExamType,
    label: 'TOEIC Listening & Reading',
    description: 'Test of English for International Communication — Listening & Reading',
    color: 'bg-amber-50 border-amber-200 hover:border-amber-400',
    activeColor: 'bg-amber-100 border-amber-500 ring-2 ring-amber-200',
    needsSkill: false,
  },
  {
    value: 'TOEIC_SW' as ExamType,
    label: 'TOEIC Speaking & Writing',
    description: 'Test of English for International Communication — Speaking & Writing',
    color: 'bg-rose-50 border-rose-200 hover:border-rose-400',
    activeColor: 'bg-rose-100 border-rose-500 ring-2 ring-rose-200',
    needsSkill: false,
  },
  {
    value: 'HSK_1' as ExamType,
    label: 'HSK 1 (汉语水平考试 一级)',
    description: 'Chinese Proficiency Test Level 1 — Listening + Reading, 150 words',
    color: 'bg-red-50 border-red-200 hover:border-red-400',
    activeColor: 'bg-red-100 border-red-500 ring-2 ring-red-200',
    needsSkill: false,
  },
  {
    value: 'HSK_2' as ExamType,
    label: 'HSK 2 (汉语水平考试 二级)',
    description: 'Chinese Proficiency Test Level 2 — Listening + Reading, 300 words',
    color: 'bg-red-50 border-red-200 hover:border-red-400',
    activeColor: 'bg-red-100 border-red-500 ring-2 ring-red-200',
    needsSkill: false,
  },
  {
    value: 'HSK_3' as ExamType,
    label: 'HSK 3 (汉语水平考试 三级)',
    description: 'Chinese Proficiency Test Level 3 — Listening + Reading + Writing, 600 words',
    color: 'bg-red-50 border-red-200 hover:border-red-400',
    activeColor: 'bg-red-100 border-red-500 ring-2 ring-red-200',
    needsSkill: false,
  },
  {
    value: 'HSK_4' as ExamType,
    label: 'HSK 4 (汉语水平考试 四级)',
    description: 'Chinese Proficiency Test Level 4 — Listening + Reading + Writing, 1200 words',
    color: 'bg-red-50 border-red-200 hover:border-red-400',
    activeColor: 'bg-red-100 border-red-500 ring-2 ring-red-200',
    needsSkill: false,
  },
  {
    value: 'HSK_5' as ExamType,
    label: 'HSK 5 (汉语水平考试 五级)',
    description: 'Chinese Proficiency Test Level 5 — Listening + Reading + Writing, 2500 words',
    color: 'bg-red-50 border-red-200 hover:border-red-400',
    activeColor: 'bg-red-100 border-red-500 ring-2 ring-red-200',
    needsSkill: false,
  },
  {
    value: 'HSK_6' as ExamType,
    label: 'HSK 6 (汉语水平考试 六级)',
    description: 'Chinese Proficiency Test Level 6 — Listening + Reading + Writing, 5000 words',
    color: 'bg-red-50 border-red-200 hover:border-red-400',
    activeColor: 'bg-red-100 border-red-500 ring-2 ring-red-200',
    needsSkill: false,
  },
];

const SKILLS = [
  { value: 'LISTENING' as SectionSkill, label: 'Listening', icon: Headphones, color: 'text-indigo-600', bgColor: 'bg-indigo-50 border-indigo-200 hover:border-indigo-400', activeColor: 'bg-indigo-100 border-indigo-500 ring-2 ring-indigo-200' },
  { value: 'READING' as SectionSkill, label: 'Reading', icon: BookOpen, color: 'text-teal-600', bgColor: 'bg-teal-50 border-teal-200 hover:border-teal-400', activeColor: 'bg-teal-100 border-teal-500 ring-2 ring-teal-200' },
  { value: 'WRITING' as SectionSkill, label: 'Writing', icon: Pen, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200 hover:border-amber-400', activeColor: 'bg-amber-100 border-amber-500 ring-2 ring-amber-200' },
  { value: 'SPEAKING' as SectionSkill, label: 'Speaking', icon: Mic, color: 'text-rose-600', bgColor: 'bg-rose-50 border-rose-200 hover:border-rose-400', activeColor: 'bg-rose-100 border-rose-500 ring-2 ring-rose-200' },
];

const TEMPLATE_INFO: Record<string, { sections: string[]; duration: number; questions: string }> = {
  'IELTS_ACADEMIC:LISTENING': { sections: ['Section 1: Social Conversation', 'Section 2: Social Monologue', 'Section 3: Academic Discussion', 'Section 4: Academic Lecture'], duration: 40, questions: '40 questions' },
  'IELTS_ACADEMIC:READING': { sections: ['Passage 1', 'Passage 2', 'Passage 3'], duration: 60, questions: '40 questions' },
  'IELTS_ACADEMIC:WRITING': { sections: ['Task 1: Data Description', 'Task 2: Essay'], duration: 60, questions: '2 tasks' },
  'IELTS_ACADEMIC:SPEAKING': { sections: ['Part 1: Introduction', 'Part 2: Long Turn', 'Part 3: Discussion'], duration: 15, questions: '3 parts' },
  'IELTS_GENERAL:LISTENING': { sections: ['Section 1: Social Conversation', 'Section 2: Social Monologue', 'Section 3: Academic Discussion', 'Section 4: Academic Lecture'], duration: 40, questions: '40 questions' },
  'IELTS_GENERAL:READING': { sections: ['Section 1: Short Factual Texts', 'Section 2: Work-Related Texts', 'Section 3: Extended Text'], duration: 60, questions: '40 questions' },
  'IELTS_GENERAL:WRITING': { sections: ['Task 1: Letter', 'Task 2: Essay'], duration: 60, questions: '2 tasks' },
  'IELTS_GENERAL:SPEAKING': { sections: ['Part 1: Introduction', 'Part 2: Long Turn', 'Part 3: Discussion'], duration: 15, questions: '3 parts' },
  'TOEIC_LR': { sections: ['Part 1: Photographs', 'Part 2: Question-Response', 'Part 3: Conversations', 'Part 4: Talks', 'Part 5: Incomplete Sentences', 'Part 6: Text Completion', 'Part 7: Reading Comprehension'], duration: 120, questions: '200 questions' },
  'TOEIC_SW': { sections: ['Speaking: Read Aloud', 'Speaking: Describe a Picture', 'Speaking: Respond to Questions', 'Speaking: Propose a Solution', 'Speaking: Express an Opinion', 'Writing: Write Sentences', 'Writing: Respond to Request', 'Writing: Write an Opinion Essay'], duration: 80, questions: '19 questions' },
  'HSK_1': { sections: ['听力 Listening', '阅读 Reading'], duration: 40, questions: '40 questions' },
  'HSK_2': { sections: ['听力 Listening', '阅读 Reading'], duration: 55, questions: '50 questions' },
  'HSK_3': { sections: ['听力 Listening', '阅读 Reading', '书写 Writing'], duration: 90, questions: '70 questions' },
  'HSK_4': { sections: ['听力 Listening', '阅读 Reading', '书写 Writing'], duration: 105, questions: '95 questions' },
  'HSK_5': { sections: ['听力 Listening', '阅读 Reading', '书写 Writing'], duration: 125, questions: '100 questions' },
  'HSK_6': { sections: ['听力 Listening', '阅读 Reading', '书写 Writing'], duration: 140, questions: '101 questions' },
};

export default function NewTestWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [examType, setExamType] = useState<ExamType | null>(null);
  const [skill, setSkill] = useState<SectionSkill | null>(null);

  const createFromTemplate = useCreateFromTemplate();
  const selectedExamConfig = EXAM_TYPES.find((e) => e.value === examType);
  const needsSkill = selectedExamConfig?.needsSkill ?? false;
  const totalSteps = needsSkill ? 3 : 2;

  const templateKey = needsSkill
    ? `${examType}:${skill}`
    : examType ?? '';
  const templateInfo = TEMPLATE_INFO[templateKey];

  function canProceed() {
    if (step === 1) return !!examType;
    if (step === 2 && needsSkill) return !!skill;
    return true;
  }

  function handleNext() {
    if (step === 1 && !needsSkill) {
      setStep(totalSteps);
    } else {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step === totalSteps && !needsSkill && totalSteps === 2) {
      setStep(1);
    } else {
      setStep(step - 1);
    }
  }

  async function handleCreate() {
    if (!examType) return;
    try {
      const result = await createFromTemplate.mutateAsync({
        examType,
        skill: skill ?? undefined,
      });
      router.push(`/admin-tests/${result.id}/edit`);
    } catch (error) {
      console.error('Failed to create test:', error);
    }
  }

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin-tests')} className="mb-4 -ml-2 text-muted-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Tests
        </Button>
        <h1 className="text-2xl font-bold">Create New Test</h1>
        <p className="text-muted-foreground mt-1">
          Step {step} of {totalSteps}
        </p>
        {/* Progress bar */}
        <div className="mt-4 h-1.5 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1: Exam Type */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">What type of exam?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {EXAM_TYPES.map((et) => (
              <Card
                key={et.value}
                className={`cursor-pointer border-2 p-5 transition-all ${
                  examType === et.value ? et.activeColor : et.color
                }`}
                onClick={() => {
                  setExamType(et.value);
                  setSkill(null);
                }}
              >
                <div className="font-semibold text-sm">{et.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{et.description}</div>
                {examType === et.value && (
                  <Check className="mt-2 h-4 w-4 text-green-600" />
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Skill (IELTS only) */}
      {step === 2 && needsSkill && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Which skill?</h2>
          <div className="grid grid-cols-2 gap-4">
            {SKILLS.map((s) => {
              const Icon = s.icon;
              return (
                <Card
                  key={s.value}
                  className={`cursor-pointer border-2 p-5 transition-all ${
                    skill === s.value ? s.activeColor : s.bgColor
                  }`}
                  onClick={() => setSkill(s.value)}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-6 w-6 ${s.color}`} />
                    <div>
                      <div className="font-semibold text-sm">{s.label}</div>
                    </div>
                  </div>
                  {skill === s.value && (
                    <Check className="mt-2 h-4 w-4 text-green-600" />
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Final Step: Confirm */}
      {step === totalSteps && templateInfo && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Confirm & Create</h2>
          <Card className="border-2 p-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">{selectedExamConfig?.label}</Badge>
                  {skill && <Badge variant="outline">{skill}</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  Duration: {templateInfo.duration} minutes · {templateInfo.questions}
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Structure Preview
                </Label>
                <div className="mt-2 space-y-1.5">
                  {templateInfo.sections.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                A draft test will be created with this structure. You can customize the title, add questions, and upload audio in the editor.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 1}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>

        {step < totalSteps ? (
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
          >
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={createFromTemplate.isPending}
          >
            {createFromTemplate.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Creating...
              </>
            ) : (
              <>
                Create Test <Check className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
