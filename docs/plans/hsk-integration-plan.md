# HSK Integration — Technical Specification v2.0

> **Version:** 2.1 | **Date:** 2026-04-04 | **Status:** Implementation In Progress
> **Scope:** HSK Levels 1–6, all three skills (Listening, Reading, Writing)
> **Covers:** Schema, Admin API, Admin UI, Learner UI, AI Grading, Scoring, QA

### Implementation Progress (updated 2026-04-04)

| Phase | Total Tasks | Done | Remaining |
|---|---|---|---|
| Phase 1 — Foundation | 16 | 14 | 2 (vocab seed, audio, E2E) |
| Phase 2 — UI Components | 13 | 13 | 0 |
| Phase 3 — AI Grading | 13 | 9 | 4 (admin eval panel, admin override, vocab page, tokenizer) |
| Phase 4 — Polish & Scale | 6 | 0 | 6 |
| **Total** | **48** | **36** | **12** |

**Remaining TODO:**
- Seed data: HSK 5 test (100q), HSK vocabulary lists, audio files
- Admin UI: WritingEvaluationPanel for admin, override/re-grade endpoints, vocabulary management page
- Backend: `nodejieba` tokenizer for vocabulary level analysis
- QA: E2E testing
- Phase 4: Character set toggle, font optimization, Redis caching, mobile responsive

**Prerequisite before running:**
1. Stop running dev server → run `npx prisma generate` in `apps/api`
2. Set `ANTHROPIC_API_KEY` in `.env` for AI writing grading

---

## Table of Contents

1. [Gap Analysis](#1-gap-analysis)
2. [Schema Design](#2-schema-design)
3. [Backend — API Changes](#3-backend--api-changes)
4. [Admin UI Changes](#4-admin-ui-changes)
5. [Learner UI Changes](#5-learner-ui-changes)
6. [AI Grading Engine](#6-ai-grading-engine)
7. [HSK Scoring System](#7-hsk-scoring-system)
8. [Integration Roadmap](#8-integration-roadmap)
9. [Automated Testing & QA Loop](#9-automated-testing--qa-loop)
10. [Technical Specification](#10-technical-specification)

---

## 1. Gap Analysis

### 1.1 HSK Test Structure (from screenshots)

| Skill | Question Range | Format | Maps to Existing? |
|---|---|---|---|
| **Listening Part 1-2** | Q1–25 | MCQ (A–D), one audio per question | YES — `MULTIPLE_CHOICE` + `QuestionGroup.audioUrl` |
| **Listening Part 3** | Q26–45 | MCQ, shared audio per group (2–4 Qs) | YES — `MULTIPLE_CHOICE` + shared `QuestionGroup.audioUrl` |
| **Reading Part 1** | Q46–60 | Passage with numbered blanks `{46}`…`{60}`, MCQ per blank | YES — `Passage.contentHtml` with `{n}` tokens + MCQ options |
| **Reading Part 2** | Q61–70 | Sentence ordering / paragraph matching | YES — `MATCHING_*` types exist |
| **Reading Part 3** | Q71–90 | Passage + image, MCQ comprehension with stems | YES — `Passage` + `QuestionGroup.imageUrl` + `MULTIPLE_CHOICE` |
| **Writing Part 1** | Q91–98 | Word fragments in `[brackets]`, type reordered sentence | **NO** — new `SENTENCE_REORDER` QuestionType |
| **Writing Part 2a** | Q99 | Keywords given → write ~80-char essay | **NO** — new `KEYWORD_COMPOSITION` QuestionType |
| **Writing Part 2b** | Q100 | Image given → write ~80-char essay | **NO** — new `PICTURE_COMPOSITION` QuestionType |

### 1.2 Full Gap Matrix

| Layer | Gap | Current State | Required Change | Effort |
|---|---|---|---|---|
| **Schema** | `ExamType` enum | 4 values (IELTS/TOEIC) | Add `HSK_1`–`HSK_6` | S |
| **Schema** | `QuestionType` enum | No reorder/composition | Add 3 new values | S |
| **Schema** | Question metadata | No pinyin/fragment fields | Add `metadata Json?` column | S |
| **Schema** | Writing evaluation | No model | New `WritingEvaluation` model | M |
| **Schema** | HSK vocabulary | No model | New `HskVocabulary` model | M |
| **Admin API** | DTOs | `ExamType` enum in DTO auto-extends | No code change (enum-driven) | — |
| **Admin API** | Template creation | Only IELTS/TOEIC templates | Add HSK template definitions | M |
| **Admin API** | Question validation | No type-specific validation | Validate `metadata` for HSK types | M |
| **Admin API** | Writing eval endpoints | None | New admin endpoints to view/override AI grades | M |
| **Admin API** | Vocabulary CRUD | None | New admin CRUD for HSK vocabulary | M |
| **Admin UI** | Test creation wizard | 4 exam types in dropdown | Add HSK 1–6 options | S |
| **Admin UI** | Test editor | No reorder/composition editors | New question type editors | L |
| **Admin UI** | Question bank filters | No HSK in exam type filter | Add HSK filter options | S |
| **Admin UI** | Writing results | No AI evaluation view | New evaluation detail panel | M |
| **Admin UI** | Vocabulary management | None | New admin page | L |
| **Learner UI** | Question renderer | No SENTENCE_REORDER case | 3 new renderer components | L |
| **Learner UI** | Layout router | No writing-specific layout | New `WritingQuestionsLayout` | M |
| **Learner UI** | Result page | No writing eval display | Show rubric breakdown | M |
| **Learner UI** | Pinyin support | None | `PinyinText` component + level rules | M |
| **Learner UI** | Character set toggle | None | User preference + render logic | M |
| **Backend** | Grading logic | Simple string compare for all | Type-specific grading in `submitAttempt` | M |
| **Backend** | Scoring | IELTS band + TOEIC scaled only | HSK scoring in `ScoringService` | M |
| **Backend** | AI integration | None | Anthropic module + async grading | L |

**Legend:** S = Small (< 1 day), M = Medium (1–3 days), L = Large (3–5 days)

### 1.3 What Already Works (Zero Changes)

These existing features handle HSK Listening + Reading with no code changes:

- **Listening MCQ**: `QuestionGroup.audioUrl` + `Question.options` + `correctAnswer`
- **Reading fill-in-blank**: `Passage.contentHtml` with `{n}` tokens → rendered by existing `FillInBlankRenderer`
- **Reading comprehension**: `Passage` + `QuestionGroup.imageUrl` + MCQ → rendered by existing `McqRenderer`
- **Attempt lifecycle**: start → auto-save (5s interval) → submit → grade → result
- **Section/skill model**: `SectionSkill.LISTENING`, `.READING`, `.WRITING` all exist
- **Audio player**: Per-group audio rendering in `AudioQuestionsLayout` and `AudioVisualLayout`
- **Layout router**: Auto-selects layout based on passages/audio/images — works for HSK sections
- **Admin test CRUD**: Full test editor, question management, publish toggle — all generic

---

## 2. Schema Design

### 2.1 Migration: `add_hsk_support`

```prisma
// ═══════════════════════════════════════════════════
// FILE: apps/api/prisma/schema.prisma — CHANGES ONLY
// ═══════════════════════════════════════════════════

// ── 1. Add HSK exam types ──
enum ExamType {
  IELTS_ACADEMIC
  IELTS_GENERAL
  TOEIC_LR
  TOEIC_SW
  HSK_1
  HSK_2
  HSK_3
  HSK_4
  HSK_5
  HSK_6
}

// ── 2. Add HSK question types ──
enum QuestionType {
  // ... all existing values unchanged ...

  // HSK Writing
  SENTENCE_REORDER
  KEYWORD_COMPOSITION
  PICTURE_COMPOSITION
}

// ── 3. Add metadata to Question ──
model Question {
  // ... all existing fields unchanged ...
  metadata  Json?   // HSK-specific structured data (see Section 2.2)
}

// ── 4. New: Writing evaluation by AI ──
model WritingEvaluation {
  id             String   @id @default(cuid())
  answerId       String   @unique
  examType       String   // "HSK_5", future: "IELTS_ACADEMIC"
  hskLevel       Int?     // 1-6, null for non-HSK
  grammarScore   Float    // 0-100
  vocabScore     Float    // 0-100
  contentScore   Float    // 0-100
  overallScore   Float    // 0-100
  feedback       String   // AI feedback (Chinese + English)
  vocabAnalysis  Json?    // { usedWords, hskLevelMatch, outOfLevelWords, missingKeywords }
  grammarErrors  Json?    // [{ text, correction, rule }]
  modelUsed      String   // "claude-sonnet-4-6"
  createdAt      DateTime @default(now())

  answer UserAnswer @relation(fields: [answerId], references: [id], onDelete: Cascade)

  @@map("writing_evaluations")
}

// ── 5. Link from UserAnswer ──
model UserAnswer {
  // ... all existing fields unchanged ...
  evaluation WritingEvaluation?   // ← add this relation
}

// ── 6. New: HSK vocabulary reference ──
model HskVocabulary {
  id           String  @id @default(cuid())
  level        Int     // 1-6
  simplified   String
  traditional  String
  pinyin       String
  meaningEn    String
  meaningVi    String?
  partOfSpeech String?

  @@unique([level, simplified])
  @@index([level])
  @@index([simplified])
  @@map("hsk_vocabulary")
}
```

### 2.2 Question `metadata` JSON Schemas

#### SENTENCE_REORDER (Writing Part 1)

```jsonc
// Question.stem = null
// Question.options = null
// Question.correctAnswer = "录取结果将在月底公布"
// Question.metadata =
{
  "type": "SENTENCE_REORDER",
  "fragments": ["结果将在", "公布", "月底", "录取"],
  "pinyin": {                          // included for HSK 3 only
    "结果将在": "jiéguǒ jiāng zài",
    "公布": "gōngbù",
    "月底": "yuèdǐ",
    "录取": "lùqǔ"
  },
  "charSet": "simplified",
  "traditionalFragments": ["結果將在", "公布", "月底", "錄取"],
  "hskLevel": 5
}
```

#### KEYWORD_COMPOSITION (Writing Part 2a)

```jsonc
// Question.stem = "请结合下列词语（要全部使用，顺序不分先后），写一篇80字左右的短文。"
// Question.correctAnswer = null  (AI-graded)
// Question.metadata =
{
  "type": "KEYWORD_COMPOSITION",
  "keywords": ["博物馆", "保存", "讲解员", "丰富", "值得"],
  "pinyin": {
    "博物馆": "bówùguǎn",
    "保存": "bǎocún",
    "讲解员": "jiǎngjiěyuán",
    "丰富": "fēngfù",
    "值得": "zhídé"
  },
  "charSet": "simplified",
  "minChars": 60,
  "maxChars": 100,
  "hskLevel": 5
}
```

#### PICTURE_COMPOSITION (Writing Part 2b)

```jsonc
// Question.stem = "请结合这张图片写一篇80字左右的短文。"
// Question.imageUrl = "https://s3.../hsk5-writing-100.jpg"
// Question.correctAnswer = null  (AI-graded)
// Question.metadata =
{
  "type": "PICTURE_COMPOSITION",
  "charSet": "simplified",
  "minChars": 60,
  "maxChars": 100,
  "hskLevel": 5,
  "imageAlt": "Two hands with wedding rings"   // accessibility + AI context
}
```

### 2.3 HSK Level Configuration

| Level | Listening | Reading | Writing | Duration | Pinyin | Vocab Size |
|---|---|---|---|---|---|---|
| HSK 1 | 20 MCQ | 20 MCQ | — | 40 min | All shown | 150 |
| HSK 2 | 25 MCQ | 25 MCQ | — | 55 min | All shown | 300 |
| HSK 3 | 30 MCQ | 30 MCQ | 10 reorder | 90 min | Hover only | 600 |
| HSK 4 | 40 MCQ | 40 MCQ | 15 (reorder + keyword) | 105 min | Hidden | 1200 |
| HSK 5 | 45 MCQ | 45 MCQ | 10 (reorder + keyword + picture) | 125 min | Hidden | 2500 |
| HSK 6 | 50 MCQ | 50 MCQ | 1 (essay summary) | 140 min | Hidden | 5000 |

---

## 3. Backend — API Changes

### 3.1 Existing Admin API — Changes Needed

These files already exist. Changes are minimal because the admin API is generic/enum-driven.

| File | Change | Details |
|---|---|---|
| `src/admin/dto/create-test.dto.ts` | **None** | `examType` uses `@IsEnum(ExamType)` — auto-extends when enum grows |
| `src/admin/dto/create-question.dto.ts` | **Add** `metadata` field | `@IsOptional() @IsObject() metadata?: Record<string, any>` |
| `src/admin/admin-tests.service.ts` | **Add** HSK templates | Add template definitions for HSK 1–6 in `createFromTemplate()` |
| `src/admin/admin-tests.service.ts` | **Add** metadata validation | Validate `metadata` shape when `questionType` is HSK-specific |
| `src/tests/tests.controller.ts` | **None** | `examType` filter already accepts any `ExamType` value |
| `src/attempts/attempts.service.ts` | **Update** `submitAttempt()` | Add HSK-specific grading branches (see 3.3) |
| `src/scoring/scoring.service.ts` | **Add** HSK scoring | Add `calculateHskScores()` method (see Section 7) |

### 3.2 New Admin API Endpoints

```
// ── HSK Vocabulary Management (admin only) ──
GET    /api/admin/hsk-vocabulary              List vocabulary (filter: level, search)
POST   /api/admin/hsk-vocabulary              Create vocabulary entry
POST   /api/admin/hsk-vocabulary/bulk         Bulk import vocabulary (CSV/JSON)
PATCH  /api/admin/hsk-vocabulary/:id          Update entry
DELETE /api/admin/hsk-vocabulary/:id          Delete entry
GET    /api/admin/hsk-vocabulary/stats        Count per level

// ── Writing Evaluation Management (admin only) ──
GET    /api/admin/writing-evaluations         List evaluations (filter: hskLevel, examType)
GET    /api/admin/writing-evaluations/:id     View evaluation detail
PATCH  /api/admin/writing-evaluations/:id     Override AI score (admin manual review)
POST   /api/admin/writing-evaluations/:answerId/regrade   Re-trigger AI grading
```

### 3.3 Updated `submitAttempt()` Grading Logic

Current grading in `attempts.service.ts` uses simple string compare for all types. HSK changes:

```typescript
// apps/api/src/attempts/attempts.service.ts — submitAttempt() changes

// BEFORE (current): All types use same logic
// isCorrect = answer.answerText?.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase()

// AFTER: Branch by question type
for (const answer of answers) {
  const question = questionMap.get(answer.questionId);
  const questionType = question.group.questionType;

  if (questionType === 'SENTENCE_REORDER') {
    // ── Deterministic: normalize + compare ──
    const result = gradeSentenceReorder(answer.answerText, question);
    answer.isCorrect = result.isCorrect;
    answer.score = result.score;           // 0, 0.5, or 1 (partial credit)
    answer.feedback = result.feedback;

  } else if (questionType === 'KEYWORD_COMPOSITION' || questionType === 'PICTURE_COMPOSITION') {
    // ── AI-graded: mark as pending, queue async grading ──
    answer.isCorrect = null;               // stays null until AI grades
    answer.pendingAiGrade = true;
    pendingWritingAnswerIds.push(answer.id);

  } else {
    // ── Existing: exact string match (MCQ, T/F, matching, fill-blank) ──
    answer.isCorrect = answer.answerText?.trim().toLowerCase()
      === question.correctAnswer.trim().toLowerCase();
  }
}

// After sync grading: queue AI grading for writing
if (pendingWritingAnswerIds.length > 0) {
  await this.hskGradingService.queueWritingGrading(attemptId, pendingWritingAnswerIds);
}
```

### 3.4 New Backend Modules

```
apps/api/src/
├── hsk-grading/                          # NEW MODULE
│   ├── hsk-grading.module.ts
│   ├── hsk-grading.service.ts            # AI grading orchestration
│   ├── hsk-grading.controller.ts         # GET /attempts/:id/writing-evaluations
│   ├── sentence-reorder.ts               # Deterministic reorder grading
│   ├── chinese-validator.ts              # countHanzi(), isValidChineseInput()
│   ├── tokenizer.ts                      # nodejieba word segmentation
│   └── prompts/
│       └── writing-system-prompt.ts      # Claude system prompt
├── anthropic/                            # NEW MODULE
│   ├── anthropic.module.ts
│   └── anthropic.service.ts              # @anthropic-ai/sdk wrapper
└── hsk-vocabulary/                       # NEW MODULE
    ├── hsk-vocabulary.module.ts
    ├── hsk-vocabulary.service.ts
    └── hsk-vocabulary.controller.ts
```

### 3.5 New Learner API Endpoints

```
// ── Writing Evaluation (learner) ──
GET    /api/attempts/:id/writing-evaluations    Get AI evaluations for submitted attempt
GET    /api/hsk/levels                          Get HSK level config (q counts, duration, pinyin rules)

// ── HSK Vocabulary (public, for study reference) ──
GET    /api/hsk-vocabulary?level=3              Get vocab list by level (paginated)
GET    /api/hsk-vocabulary/search?q=你好        Search across levels
```

### 3.6 HSK Test Template Definitions

Add to `admin-tests.service.ts` `createFromTemplate()`:

```typescript
const HSK_TEMPLATES: Record<string, TemplateDefinition> = {
  HSK_1: {
    durationMins: 40,
    sections: [
      { title: '听力 Listening', skill: 'LISTENING', questionGroups: [
        { questionType: 'MULTIPLE_CHOICE', questionCount: 20 }
      ]},
      { title: '阅读 Reading', skill: 'READING', questionGroups: [
        { questionType: 'MULTIPLE_CHOICE', questionCount: 20 }
      ]},
    ],
  },
  HSK_3: {
    durationMins: 90,
    sections: [
      { title: '听力 Listening', skill: 'LISTENING', questionGroups: [
        { questionType: 'MULTIPLE_CHOICE', questionCount: 30 }
      ]},
      { title: '阅读 Reading', skill: 'READING', questionGroups: [
        { questionType: 'MULTIPLE_CHOICE', questionCount: 30 }
      ]},
      { title: '书写 Writing', skill: 'WRITING', questionGroups: [
        { questionType: 'SENTENCE_REORDER', questionCount: 10 }
      ]},
    ],
  },
  HSK_5: {
    durationMins: 125,
    sections: [
      { title: '听力 Listening', skill: 'LISTENING', questionGroups: [
        { questionType: 'MULTIPLE_CHOICE', questionCount: 45 }
      ]},
      { title: '阅读 Reading', skill: 'READING', questionGroups: [
        { questionType: 'MULTIPLE_CHOICE', questionCount: 45 }
      ]},
      { title: '书写 Part 1 — 排列顺序', skill: 'WRITING', questionGroups: [
        { questionType: 'SENTENCE_REORDER', questionCount: 8 }
      ]},
      { title: '书写 Part 2 — 写作', skill: 'WRITING', questionGroups: [
        { questionType: 'KEYWORD_COMPOSITION', questionCount: 1 },
        { questionType: 'PICTURE_COMPOSITION', questionCount: 1 },
      ]},
    ],
  },
  // HSK_2, HSK_4, HSK_6 follow same pattern...
};
```

---

## 4. Admin UI Changes

### 4.1 Test Creation Wizard — `admin-tests/new/page.tsx`

**Current:** Dropdown with 4 exam types (IELTS Academic, IELTS General, TOEIC L&R, TOEIC S&W).

**Change:** Add HSK 1–6 to the exam type selector.

```tsx
// Update the examType options in the creation wizard
const EXAM_TYPE_OPTIONS = [
  // ... existing IELTS/TOEIC options ...
  { label: 'HSK 1 (汉语水平考试 一级)', value: 'HSK_1', group: 'HSK' },
  { label: 'HSK 2 (汉语水平考试 二级)', value: 'HSK_2', group: 'HSK' },
  { label: 'HSK 3 (汉语水平考试 三级)', value: 'HSK_3', group: 'HSK' },
  { label: 'HSK 4 (汉语水平考试 四级)', value: 'HSK_4', group: 'HSK' },
  { label: 'HSK 5 (汉语水平考试 五级)', value: 'HSK_5', group: 'HSK' },
  { label: 'HSK 6 (汉语水平考试 六级)', value: 'HSK_6', group: 'HSK' },
];
```

**Effort:** Small — add options to existing `<Select>` component.

### 4.2 Test Editor — `admin-tests/[id]/edit/page.tsx`

**Current:** Supports all existing question types. Question group editor has fields for `questionType`, `instructions`, `matchingOptions`, `audioUrl`, `imageUrl`, and per-question fields (`stem`, `options`, `correctAnswer`, `explanation`).

**Changes needed:**

#### 4.2.1 Question Type Selector

Add 3 new options to the question type dropdown in the group editor:

```tsx
const QUESTION_TYPE_OPTIONS = [
  // ... existing options ...
  { label: 'Sentence Reorder (排列顺序)', value: 'SENTENCE_REORDER' },
  { label: 'Keyword Composition (看词写作)', value: 'KEYWORD_COMPOSITION' },
  { label: 'Picture Composition (看图写作)', value: 'PICTURE_COMPOSITION' },
];
```

#### 4.2.2 Sentence Reorder Question Editor (NEW)

When `questionType === 'SENTENCE_REORDER'`, show this editor per question:

```
┌─────────────────────────────────────────────────────┐
│ Question 91                                          │
│                                                      │
│ Fragments (one per line):                            │
│ ┌──────────────────────────────────┐                │
│ │ 结果将在                          │  [+ Add]       │
│ │ 公布                              │                │
│ │ 月底                              │                │
│ │ 录取                              │                │
│ └──────────────────────────────────┘                │
│                                                      │
│ Correct Sentence:                                    │
│ ┌──────────────────────────────────┐                │
│ │ 录取结果将在月底公布               │                │
│ └──────────────────────────────────┘                │
│                                                      │
│ ☐ Include Pinyin (for HSK 3)                        │
│ Pinyin mapping: (auto-generated or manual)           │
│   结果将在 → jiéguǒ jiāng zài                       │
│   公布     → gōngbù                                 │
│   月底     → yuèdǐ                                  │
│   录取     → lùqǔ                                   │
│                                                      │
│ [Validate ✓] — checks fragments form correct answer │
└─────────────────────────────────────────────────────┘
```

**Implementation:** New component `SentenceReorderEditor.tsx` in admin components.

#### 4.2.3 Composition Question Editor (NEW)

When `questionType === 'KEYWORD_COMPOSITION'`:

```
┌─────────────────────────────────────────────────────┐
│ Question 99                                          │
│                                                      │
│ Prompt (stem):                                       │
│ ┌──────────────────────────────────────────────────┐│
│ │请结合下列词语（要全部使用，顺序不分先后），        ││
│ │写一篇80字左右的短文。                              ││
│ └──────────────────────────────────────────────────┘│
│                                                      │
│ Keywords (comma-separated):                          │
│ ┌──────────────────────────────────┐                │
│ │ 博物馆, 保存, 讲解员, 丰富, 值得  │                │
│ └──────────────────────────────────┘                │
│                                                      │
│ Character Limits:  Min [60]  Max [100]              │
│ HSK Level: [5 ▼]                                     │
│                                                      │
│ ⚠ No correctAnswer — this question is AI-graded     │
└─────────────────────────────────────────────────────┘
```

When `questionType === 'PICTURE_COMPOSITION'`:

```
┌─────────────────────────────────────────────────────┐
│ Question 100                                         │
│                                                      │
│ Prompt (stem):                                       │
│ ┌──────────────────────────────────────────────────┐│
│ │请结合这张图片写一篇80字左右的短文。                ││
│ └──────────────────────────────────────────────────┘│
│                                                      │
│ Image: [Upload ↑] or [URL: https://...]             │
│ ┌────────────────┐                                  │
│ │   [preview]     │  Alt text: Two hands with rings │
│ └────────────────┘                                  │
│                                                      │
│ Character Limits:  Min [60]  Max [100]              │
│ HSK Level: [5 ▼]                                     │
│                                                      │
│ ⚠ No correctAnswer — this question is AI-graded     │
└─────────────────────────────────────────────────────┘
```

**Implementation:** New component `CompositionEditor.tsx` in admin components.

### 4.3 Question Bank — `admin-questions/page.tsx`

**Current:** Filter by skill, questionType, examType. Exam type filter shows IELTS/TOEIC only.

**Changes:**
- Add `HSK_1`–`HSK_6` to exam type filter options
- Add `SENTENCE_REORDER`, `KEYWORD_COMPOSITION`, `PICTURE_COMPOSITION` to question type filter
- Display `metadata.fragments` in question preview for reorder type
- Display `metadata.keywords` in question preview for keyword composition

### 4.4 Writing Results — `admin-results/page.tsx`

**Current:** Shows Q&A breakdown with `isCorrect` per answer. No AI evaluation display.

**Changes:** When viewing an HSK attempt result with writing questions:

```
┌─────────────────────────────────────────────────────┐
│ Q99 — Keyword Composition                  AI Graded │
│                                                      │
│ Keywords: 博物馆, 保存, 讲解员, 丰富, 值得            │
│                                                      │
│ Student's Answer:                                    │
│ "上周末我去了博物馆。博物馆里保存着丰富的文物..."      │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Grammar:  ████████░░  82/100                    │ │
│ │ Vocab:    █████████░  90/100                    │ │
│ │ Content:  ███████░░░  75/100                    │ │
│ │ Overall:  ████████░░  82/100                    │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Grammar Errors:                                      │
│  • "保存着丰富" → "保存了丰富" (了 vs 着 aspect)     │
│                                                      │
│ Missing Keywords: 讲解员                              │
│                                                      │
│ [Override Score] [Re-grade with AI]                   │
└─────────────────────────────────────────────────────┘
```

### 4.5 New Admin Page: HSK Vocabulary — `admin-vocabulary/page.tsx`

```
┌─────────────────────────────────────────────────────┐
│ HSK Vocabulary Management                            │
│                                                      │
│ [HSK 1 ▼] [Search: ______] [Import CSV ↑] [+ Add]  │
│                                                      │
│ ┌────┬──────┬──────┬────────┬─────────┬──────────┐  │
│ │ #  │ 简体 │ 繁體 │ Pīnyīn │ English │ Tiếng Việt│ │
│ ├────┼──────┼──────┼────────┼─────────┼──────────┤  │
│ │ 1  │ 你好 │ 你好 │ nǐhǎo  │ hello   │ xin chào │  │
│ │ 2  │ 谢谢 │ 謝謝 │ xièxiè │ thanks  │ cảm ơn   │  │
│ │ ...│      │      │        │         │          │  │
│ └────┴──────┴──────┴────────┴─────────┴──────────┘  │
│                                                      │
│ Stats: HSK 1: 150 │ HSK 2: 300 │ ... │ HSK 6: 5000 │
└─────────────────────────────────────────────────────┘
```

### 4.6 Admin File Manifest (New/Changed)

```
apps/web/src/app/(admin)/
├── admin-tests/
│   ├── new/page.tsx                          # CHANGE: add HSK exam types
│   └── [id]/edit/
│       └── page.tsx                          # CHANGE: add HSK question type editors
├── admin-questions/page.tsx                  # CHANGE: add HSK filters
├── admin-results/page.tsx                    # CHANGE: add writing evaluation display
└── admin-vocabulary/                         # NEW
    └── page.tsx                              # HSK vocabulary CRUD page

apps/web/src/components/admin/               # NEW (or add to existing)
├── SentenceReorderEditor.tsx                 # Editor for reorder questions
├── CompositionEditor.tsx                     # Editor for keyword/picture composition
└── WritingEvaluationPanel.tsx                # AI evaluation display + override
```

---

## 5. Learner UI Changes

### 5.1 Question Renderer Dispatcher — `components/question-renderers/index.tsx`

**Current logic** (simplified):
```
if MCQ/T-F/Y-N          → McqRenderer
if COMPLETION/SHORT      → FillInBlankRenderer (60/40 split)
if MATCHING_*            → MatchingRenderer (60/40 split)
```

**Add 3 new branches:**

```typescript
// In QuestionGroupRenderer — add before the default case

case 'SENTENCE_REORDER':
  return (
    <SentenceReorderRenderer
      group={group}
      questions={questions}
      answers={answers}
      onAnswer={onAnswer}
    />
  );

case 'KEYWORD_COMPOSITION':
  return (
    <KeywordCompositionRenderer
      group={group}
      questions={questions}
      answers={answers}
      onAnswer={onAnswer}
    />
  );

case 'PICTURE_COMPOSITION':
  return (
    <PictureCompositionRenderer
      group={group}
      questions={questions}
      answers={answers}
      onAnswer={onAnswer}
    />
  );
```

### 5.2 New Renderer: `SentenceReorderRenderer.tsx`

```tsx
// apps/web/src/components/question-renderers/sentence-reorder-renderer.tsx

interface Props {
  group: QuestionGroup;
  questions: Question[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
}

export function SentenceReorderRenderer({ group, questions, answers, onAnswer }: Props) {
  return (
    <div className="space-y-6">
      {group.instructions && (
        <div className="text-gray-600 mb-4">{group.instructions}</div>
      )}

      {questions.map((question) => {
        const meta = question.metadata as SentenceReorderMeta;
        return (
          <div key={question.id} className="border rounded-lg p-4">
            <div className="font-bold mb-3">Question {question.questionNumber}</div>

            {/* Fragment chips — draggable */}
            <div className="flex flex-wrap gap-2 mb-4">
              {meta.fragments.map((fragment, i) => (
                <FragmentChip
                  key={i}
                  text={fragment}
                  pinyin={meta.pinyin?.[fragment]}
                  showPinyin={meta.hskLevel <= 3}
                />
              ))}
            </div>

            {/* Text input — user types the reordered sentence */}
            <Input.TextArea
              placeholder="在此输入完整句子..."
              value={answers[question.id] || ''}
              onChange={(e) => onAnswer(question.id, e.target.value)}
              rows={2}
            />
          </div>
        );
      })}
    </div>
  );
}
```

### 5.3 New Renderer: `KeywordCompositionRenderer.tsx`

```tsx
// apps/web/src/components/question-renderers/keyword-composition-renderer.tsx

export function KeywordCompositionRenderer({ group, questions, answers, onAnswer }: Props) {
  return (
    <div className="space-y-6">
      {questions.map((question) => {
        const meta = question.metadata as KeywordCompositionMeta;
        const answer = answers[question.id] || '';
        const charCount = countHanzi(answer);
        const keywordStatus = checkKeywordsUsed(answer, meta.keywords);

        return (
          <div key={question.id} className="border rounded-lg p-4">
            <div className="font-bold mb-2">Question {question.questionNumber}</div>

            {/* Prompt */}
            <div className="text-gray-700 mb-3">{question.stem}</div>

            {/* Keywords display */}
            <div className="flex gap-2 mb-3">
              {meta.keywords.map((kw, i) => (
                <Tag
                  key={i}
                  color={answer.includes(kw) ? 'green' : 'default'}
                >
                  {kw} {answer.includes(kw) ? '✓' : ''}
                </Tag>
              ))}
            </div>

            {/* Writing area */}
            <Input.TextArea
              placeholder="在此写作..."
              value={answer}
              onChange={(e) => onAnswer(question.id, e.target.value)}
              rows={6}
              maxLength={meta.maxChars * 2}  // rough limit, hanzi counting is separate
            />

            {/* Character counter */}
            <div className={`text-sm mt-1 ${
              charCount < meta.minChars ? 'text-red-500' :
              charCount > meta.maxChars ? 'text-red-500' : 'text-green-600'
            }`}>
              {charCount} / {meta.maxChars} 字
              {charCount < meta.minChars && ` (至少 ${meta.minChars} 字)`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### 5.4 New Renderer: `PictureCompositionRenderer.tsx`

Same as `KeywordCompositionRenderer` but displays `question.imageUrl` instead of keywords:

```tsx
// Shows image with zoom capability
<div className="mb-4">
  <Image
    src={question.imageUrl}
    alt={meta.imageAlt || '写作图片'}
    className="max-h-60 rounded cursor-zoom-in"
    preview={true}  // Ant Design Image preview/zoom
  />
</div>
```

### 5.5 Layout Router — `layout-router.tsx`

**Current logic:**
```
hasPassages        → PassageQuestionsLayout
hasAudio + images  → AudioVisualLayout
hasAudio           → AudioQuestionsLayout
default            → QuestionsOnlyLayout
```

**Change:** Add a writing-specific layout detection:

```typescript
// Add before the default case
const hasWritingQuestions = section.questionGroups?.some(g =>
  ['SENTENCE_REORDER', 'KEYWORD_COMPOSITION', 'PICTURE_COMPOSITION'].includes(g.questionType)
);

if (hasWritingQuestions) {
  return <WritingQuestionsLayout {...props} />;
}
```

**New `WritingQuestionsLayout`:** Full-width layout (no 50/50 split), questions stacked vertically with generous spacing. No passage panel needed.

### 5.6 Result Page — `tests/[id]/result/page.tsx`

**Current:** Shows summary cards (Correct/Total, Accuracy, Time) + analysis table + answer key grid + question detail modal.

**Changes for HSK writing results:**

1. **Summary cards:** Show "Writing: Pending AI Grade" or "Writing: 82/100" once graded
2. **Analysis table:** Add rows for SENTENCE_REORDER, KEYWORD_COMPOSITION, PICTURE_COMPOSITION
3. **Answer key grid:** Writing questions show score (0/0.5/1 for reorder, AI score for composition)
4. **Question detail modal:** For composition questions, show the `WritingEvaluation` rubric:

```
┌────────────────────────────────────────────┐
│ Q99 — Writing Evaluation                    │
│                                            │
│ Your answer:                               │
│ "上周末我去了博物馆。博物馆里保存着..."      │
│                                            │
│ Grammar:  ████████░░  82   ← bar chart     │
│ Vocab:    █████████░  90                    │
│ Content:  ███████░░░  75                    │
│ Overall:  ████████░░  82                    │
│                                            │
│ Feedback:                                  │
│ 你的文章结构清晰，词汇使用比较恰当。        │
│ 建议注意"着"和"了"的使用区别。              │
│                                            │
│ Grammar errors:                            │
│ • "保存着丰富" → "保存了丰富"              │
│                                            │
│ Keywords used: ✓博物馆 ✓保存 ✓丰富 ✓值得   │
│ Missing: ✗讲解员                            │
└────────────────────────────────────────────┘
```

5. **Polling for AI grades:** If writing evaluations are pending, poll every 3 seconds:

```typescript
const { data: evaluations } = useQuery({
  queryKey: ['writing-evaluations', attemptId],
  queryFn: () => api.get(`/attempts/${attemptId}/writing-evaluations`),
  refetchInterval: hasPendingEvals ? 3000 : false,  // stop polling once all graded
});
```

### 5.7 Pinyin Support — `PinyinText.tsx`

```tsx
// apps/web/src/components/hsk/PinyinText.tsx

interface PinyinTextProps {
  hanzi: string;
  pinyin?: string;
  hskLevel: number;
  mode?: 'always' | 'hover' | 'hidden';
}

export function PinyinText({ hanzi, pinyin, hskLevel, mode }: PinyinTextProps) {
  // Auto-determine mode from HSK level if not explicit
  const effectiveMode = mode ?? (hskLevel <= 2 ? 'always' : hskLevel === 3 ? 'hover' : 'hidden');

  if (effectiveMode === 'hidden' || !pinyin) {
    return <span>{hanzi}</span>;
  }

  return (
    <ruby className={effectiveMode === 'hover' ? 'pinyin-hover' : ''}>
      {hanzi}
      <rp>(</rp>
      <rt className={effectiveMode === 'hover' ? 'opacity-0 group-hover:opacity-100' : ''}>
        {pinyin}
      </rt>
      <rp>)</rp>
    </ruby>
  );
}
```

### 5.8 Test Library — `tests/page.tsx`

**Current:** Category tabs for IELTS/TOEIC.

**Change:** Add HSK tab:

```tsx
const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'IELTS', label: 'IELTS', examTypes: ['IELTS_ACADEMIC', 'IELTS_GENERAL'] },
  { key: 'TOEIC', label: 'TOEIC', examTypes: ['TOEIC_LR', 'TOEIC_SW'] },
  { key: 'HSK', label: 'HSK 汉语', examTypes: ['HSK_1','HSK_2','HSK_3','HSK_4','HSK_5','HSK_6'] },
];
```

### 5.9 Learner File Manifest (New/Changed)

```
apps/web/src/
├── components/
│   ├── question-renderers/
│   │   ├── index.tsx                          # CHANGE: add 3 new case branches
│   │   ├── sentence-reorder-renderer.tsx      # NEW
│   │   ├── keyword-composition-renderer.tsx   # NEW
│   │   └── picture-composition-renderer.tsx   # NEW
│   ├── attempt-layouts/
│   │   ├── layout-router.tsx                  # CHANGE: add writing layout detection
│   │   └── writing-questions.tsx              # NEW: full-width writing layout
│   └── hsk/
│       ├── PinyinText.tsx                     # NEW
│       ├── FragmentChip.tsx                   # NEW: draggable chip for reorder
│       ├── CharacterCounter.tsx               # NEW: hanzi counter
│       └── KeywordChecklist.tsx               # NEW: real-time keyword tracker
├── app/(learner)/
│   └── tests/
│       ├── page.tsx                           # CHANGE: add HSK category tab
│       └── [id]/
│           └── result/page.tsx                # CHANGE: add writing evaluation display
└── lib/
    └── chinese-utils.ts                       # NEW: countHanzi(), checkKeywordsUsed()
```

---

## 6. AI Grading Engine

### 6.1 Grading Strategy by Question Type

| Type | Method | Latency | Model |
|---|---|---|---|
| `MULTIPLE_CHOICE` | Exact string match | <1ms | None |
| `SENTENCE_REORDER` | Normalize + compare + partial credit | <1ms | None |
| `KEYWORD_COMPOSITION` | Claude AI evaluation | 3–5s | `claude-sonnet-4-6` |
| `PICTURE_COMPOSITION` | Claude AI evaluation | 3–5s | `claude-sonnet-4-6` |

### 6.2 Sentence Reorder — Deterministic Grading

```typescript
// apps/api/src/hsk-grading/sentence-reorder.ts

export function gradeSentenceReorder(
  userAnswer: string | null,
  question: { correctAnswer: string; metadata: { fragments: string[] } },
): { isCorrect: boolean; score: number; feedback: string } {
  if (!userAnswer?.trim()) {
    return { isCorrect: false, score: 0, feedback: '未作答。' };
  }

  const normalize = (s: string) => s.replace(/[\s，。、！？,.!?\u3000]/g, '');
  const userNorm = normalize(userAnswer);
  const correctNorm = normalize(question.correctAnswer);

  // Exact match → full credit
  if (userNorm === correctNorm) {
    return { isCorrect: true, score: 1, feedback: '完全正确！' };
  }

  // All fragments present but wrong order → partial credit
  const fragments = question.metadata.fragments;
  const allPresent = fragments.every(f => userNorm.includes(normalize(f)));

  if (allPresent) {
    return { isCorrect: false, score: 0.5, feedback: '词语都用了，但语序不正确。' };
  }

  return { isCorrect: false, score: 0, feedback: '请使用所有给定的词语组成句子。' };
}
```

### 6.3 AI Writing — System Prompt

```typescript
// apps/api/src/hsk-grading/prompts/writing-system-prompt.ts

export const HSK_WRITING_SYSTEM_PROMPT = `You are an official HSK writing examiner. Grade strictly per HSK standards.

## Criteria (each 0–100)

1. **Grammar (语法)**: Sentence structure, 把/被, aspect particles (了/过/着), measure words, conjunctions.
2. **Vocabulary (词汇)**: Level-appropriate words, required keyword usage, variety.
3. **Content (内容)**: Prompt relevance, logical coherence, completeness.

## Output (strict JSON, no markdown)
{
  "grammarScore": <0-100>,
  "vocabScore": <0-100>,
  "contentScore": <0-100>,
  "overallScore": <0-100>,
  "feedback": "<2-3 sentences in Chinese, then English translation>",
  "grammarErrors": [{"text":"<wrong>","correction":"<right>","rule":"<grammar rule>"}],
  "vocabAnalysis": {
    "usedWords": ["<word1>"],
    "hskLevelMatch": <boolean>,
    "outOfLevelWords": ["<words above target level>"],
    "missingKeywords": ["<required keywords not used>"]
  }
}

## Rules
- Use the official HSK vocabulary list for the target level. Do NOT guess levels.
- Deduct contentScore if character count is below minChars.
- Deduct vocabScore if required keywords are missing.
- Be encouraging but accurate.`;
```

### 6.4 Grading Service

```typescript
// apps/api/src/hsk-grading/hsk-grading.service.ts

@Injectable()
export class HskGradingService {
  constructor(
    private prisma: PrismaService,
    private anthropic: AnthropicService,
  ) {}

  /** Queue async grading for writing answers after test submission */
  async queueWritingGrading(attemptId: string, answerIds: string[]): Promise<void> {
    // Grade each answer independently (fire-and-forget, results saved to DB)
    for (const answerId of answerIds) {
      this.gradeWritingAnswer(answerId).catch(err => {
        console.error(`Failed to grade answer ${answerId}:`, err);
      });
    }
  }

  async gradeWritingAnswer(answerId: string): Promise<WritingEvaluation> {
    const answer = await this.prisma.userAnswer.findUniqueOrThrow({
      where: { id: answerId },
      include: { question: { include: { group: { include: { section: true } } } } },
    });

    const meta = answer.question.metadata as HskWritingMeta;
    const prompt = this.buildPrompt(answer.question, answer.answerText);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: HSK_WRITING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = JSON.parse(response.content[0].text);

    // Save evaluation
    const evaluation = await this.prisma.writingEvaluation.create({
      data: {
        answerId,
        examType: 'HSK_' + meta.hskLevel,
        hskLevel: meta.hskLevel,
        grammarScore: result.grammarScore,
        vocabScore: result.vocabScore,
        contentScore: result.contentScore,
        overallScore: result.overallScore,
        feedback: result.feedback,
        vocabAnalysis: result.vocabAnalysis,
        grammarErrors: result.grammarErrors,
        modelUsed: 'claude-sonnet-4-6',
      },
    });

    // Update answer's isCorrect based on overall score
    await this.prisma.userAnswer.update({
      where: { id: answerId },
      data: { isCorrect: result.overallScore >= 60 },
    });

    return evaluation;
  }

  private buildPrompt(question: Question, answer: string): string {
    const meta = question.metadata as HskWritingMeta;
    let prompt = `## HSK Level: ${meta.hskLevel}\n\n`;

    if (question.group.questionType === 'KEYWORD_COMPOSITION') {
      prompt += `## Prompt\n${question.stem}\n\n`;
      prompt += `## Required Keywords\n${meta.keywords.join('、')}\n\n`;
    } else {
      prompt += `## Prompt\n${question.stem}\n\n`;
      if (meta.imageAlt) prompt += `## Image Description\n${meta.imageAlt}\n\n`;
    }

    prompt += `## Limits\nMin: ${meta.minChars}, Max: ${meta.maxChars}\n\n`;
    prompt += `## Student's Answer (${answer?.length || 0} characters)\n${answer || '(empty)'}\n`;

    return prompt;
  }
}
```

### 6.5 Chinese Text Utilities

```typescript
// apps/api/src/hsk-grading/chinese-validator.ts

/** Count only CJK Unified Ideographs (hanzi) */
export function countHanzi(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
}

/** Validate text contains Chinese characters + allowed punctuation */
export function isValidChineseInput(text: string): boolean {
  const valid = /^[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\d\s\n]+$/;
  return valid.test(text.trim());
}

/** Check which required keywords appear in text */
export function checkKeywordsUsed(text: string, keywords: string[]): {
  allPresent: boolean;
  used: string[];
  missing: string[];
} {
  const used = keywords.filter(kw => text.includes(kw));
  const missing = keywords.filter(kw => !text.includes(kw));
  return { allPresent: missing.length === 0, used, missing };
}
```

---

## 7. HSK Scoring System

### 7.1 Official HSK Scoring Rules

HSK uses a **percentage-based scaled score** system, NOT band scores like IELTS:

| Level | Listening Max | Reading Max | Writing Max | Total Max | Pass Score |
|---|---|---|---|---|---|
| HSK 1 | 100 | 100 | — | 200 | 120 (60%) |
| HSK 2 | 100 | 100 | — | 200 | 120 (60%) |
| HSK 3 | 100 | 100 | 100 | 300 | 180 (60%) |
| HSK 4 | 100 | 100 | 100 | 300 | 180 (60%) |
| HSK 5 | 100 | 100 | 100 | 300 | 180 (60%) |
| HSK 6 | 100 | 100 | 100 | 300 | 180 (60%) |

Each skill is scaled to 100 points. Pass threshold is 60% of total.

### 7.2 Scoring Service Update

```typescript
// apps/api/src/scoring/scoring.service.ts — ADD this method

calculateHskScores(
  sectionResults: { skill: SectionSkill; correct: number; total: number; writingScore?: number }[],
  examType: ExamType,
): { scaledScore: number; sectionScores: Record<string, number>; passed: boolean } {

  const hskLevel = parseInt(examType.replace('HSK_', ''));
  const hasWriting = hskLevel >= 3;
  const sectionScores: Record<string, number> = {};

  for (const section of sectionResults) {
    if (section.skill === 'WRITING') {
      // Writing: weighted average of reorder (deterministic) + composition (AI score)
      // Reorder questions: score is 0/0.5/1 per question
      // Composition: overallScore from WritingEvaluation (0-100)
      sectionScores['WRITING'] = section.writingScore ?? 0;
    } else {
      // Listening & Reading: raw correct / total * 100
      sectionScores[section.skill] = Math.round((section.correct / section.total) * 100);
    }
  }

  const totalMax = hasWriting ? 300 : 200;
  const passScore = totalMax * 0.6;
  const scaledScore = Object.values(sectionScores).reduce((sum, s) => sum + s, 0);

  return {
    scaledScore,
    sectionScores,
    passed: scaledScore >= passScore,
  };
}
```

### 7.3 Writing Section Score Calculation

HSK Writing has mixed question types. The section score (0–100) is calculated:

```typescript
function calculateWritingSectionScore(
  reorderAnswers: { score: number }[],     // each 0, 0.5, or 1
  compositionEvals: WritingEvaluation[],   // each has overallScore 0-100
  hskLevel: number,
): number {
  // Weight distribution varies by level
  const weights = {
    3: { reorder: 1.0, composition: 0.0 },       // HSK 3: reorder only
    4: { reorder: 0.6, composition: 0.4 },        // HSK 4: 60% reorder, 40% composition
    5: { reorder: 0.4, composition: 0.6 },        // HSK 5: 40% reorder, 60% composition
    6: { reorder: 0.0, composition: 1.0 },        // HSK 6: essay only
  };

  const w = weights[hskLevel] || { reorder: 0.5, composition: 0.5 };

  // Reorder score: average of individual scores * 100
  const reorderScore = reorderAnswers.length > 0
    ? (reorderAnswers.reduce((sum, a) => sum + a.score, 0) / reorderAnswers.length) * 100
    : 0;

  // Composition score: average of AI evaluations
  const compScore = compositionEvals.length > 0
    ? compositionEvals.reduce((sum, e) => sum + e.overallScore, 0) / compositionEvals.length
    : 0;

  return Math.round(reorderScore * w.reorder + compScore * w.composition);
}
```

### 7.4 Integration into `submitAttempt()`

```typescript
// In attempts.service.ts — after grading all answers

if (examType.startsWith('HSK_')) {
  const hskScores = this.scoringService.calculateHskScores(sectionResults, examType);

  await this.prisma.userAttempt.update({
    where: { id: attemptId },
    data: {
      scaledScore: hskScores.scaledScore,
      sectionScores: hskScores.sectionScores,
      scorePercent: (hskScores.scaledScore / (hskLevel >= 3 ? 300 : 200)) * 100,
      // Note: writing scores may update later when AI grading completes
    },
  });
}
```

---

## 8. Integration Roadmap

### Phase 1 — Foundation (Weeks 1–3)

**Goal:** HSK tests are creatable and browsable. Listening + Reading work end-to-end with auto-grading.

| Week | Task | Files Changed/Created | Owner | Status |
|---|---|---|---|---|
| **W1** | Add `HSK_1`–`HSK_6` to `ExamType` enum | `schema.prisma` | Backend | ✅ Done |
| **W1** | Add `SENTENCE_REORDER`, `KEYWORD_COMPOSITION`, `PICTURE_COMPOSITION` to `QuestionType` | `schema.prisma` | Backend | ✅ Done |
| **W1** | Add `metadata Json?` to `Question` model | `schema.prisma` | Backend | ✅ Done |
| **W1** | Create `WritingEvaluation` model | `schema.prisma` | Backend | ✅ Done |
| **W1** | Create `HskVocabulary` model | `schema.prisma` | Backend | ✅ Done |
| **W1** | Run migration: `prisma migrate dev --name add_hsk_support` | `prisma/migrations/` | Backend | ✅ Done |
| **W2** | Add HSK templates to `createFromTemplate()` | `admin-tests.service.ts` | Backend | ✅ Done |
| **W2** | Add `metadata` field to `CreateQuestionDto` | `create-test.dto.ts` | Backend | ✅ Done |
| **W2** | Update grading: add `SENTENCE_REORDER` branch in `submitAttempt()` | `attempts.service.ts` | Backend | ✅ Done |
| **W2** | Add HSK scoring to `ScoringService` | `scoring.service.ts` | Backend | ✅ Done |
| **W2** | Seed: 1 complete HSK 5 test (100 questions) + HSK tags | `prisma/seed.ts` | Backend | ✅ Done |
| **W3** | Seed: HSK 1–6 vocabulary lists (~5000 words) | `prisma/seeds/hsk-vocabulary.ts` | Backend | ⬜ TODO |
| **W3** | Upload HSK audio files to S3 | `hsk/{level}/audio/` | Backend | ⬜ TODO |
| **W3** | Add HSK tab to test library | `tests/page.tsx` | Frontend | ✅ Already existed |
| **W3** | Add HSK exam types to admin test creation wizard | `admin-tests/new/page.tsx` | Frontend | ✅ Done |
| **W3** | E2E: browse HSK → start attempt → answer Listening+Reading → submit → view result | — | QA | ⬜ TODO |

**Deliverable:** Student can take HSK Listening + Reading sections. Writing saves answers but shows "Pending" status.

---

### Phase 2 — UI Components (Weeks 4–6)

**Goal:** Full test-taking experience for all HSK question types.

| Week | Task | Files | Owner | Status |
|---|---|---|---|---|
| **W4** | Build `SentenceReorderRenderer` component | `question-renderers/sentence-reorder-renderer.tsx` | Frontend | ✅ Done |
| **W4** | Build `FragmentChip` (click-based, no drag-and-drop yet) | `hsk/FragmentChip.tsx` | Frontend | ✅ Done (no @dnd-kit) |
| **W4** | Add `SENTENCE_REORDER` case to question dispatcher | `question-renderers/index.tsx` | Frontend | ✅ Done |
| **W5** | Build `KeywordCompositionRenderer` | `question-renderers/keyword-composition-renderer.tsx` | Frontend | ✅ Done |
| **W5** | Build `PictureCompositionRenderer` | `question-renderers/picture-composition-renderer.tsx` | Frontend | ✅ Done |
| **W5** | Build `CharacterCounter` + `KeywordChecklist` | `hsk/CharacterCounter.tsx`, `hsk/KeywordChecklist.tsx` | Frontend | ✅ Done |
| **W5** | Build `PinyinText` component + CSS for ruby annotations | `hsk/PinyinText.tsx` | Frontend | ✅ Done |
| **W5** | Add `WritingQuestionsLayout` to layout router | `attempt-layouts/writing-questions.tsx` | Frontend | ✅ Done |
| **W6** | Build `SentenceReorderEditor` for admin test editor | Inline in `admin-tests/[id]/edit/page.tsx` | Frontend | ✅ Done (inline) |
| **W6** | Build `CompositionEditor` for admin test editor | Inline in `admin-tests/[id]/edit/page.tsx` | Frontend | ✅ Done (inline) |
| **W6** | Add 3 new question types to admin editor's question type selector | `admin-tests/[id]/edit/page.tsx` | Frontend | ✅ Done |
| **W6** | Add HSK filters to admin question bank | `admin-questions/page.tsx` | Frontend | ✅ Done (types added) |
| **W6** | Create `chinese-utils.ts` (countHanzi, checkKeywordsUsed) | `lib/chinese-utils.ts` | Frontend | ✅ Done |

**Deliverable:** Full HSK test-taking UI including drag-and-drop reorder, composition with live character count and keyword tracking, pinyin support for HSK 1–3.

---

### Phase 3 — AI Grading (Weeks 7–9)

**Goal:** AI-powered writing evaluation with rubric feedback.

| Week | Task | Files | Owner | Status |
|---|---|---|---|---|
| **W7** | Create `AnthropicModule` + `AnthropicService` | `anthropic/anthropic.module.ts`, `.service.ts` | Backend | ✅ Done |
| **W7** | Create `HskGradingModule` + `HskGradingService` | `hsk-grading/hsk-grading.module.ts`, `.service.ts` | Backend | ✅ Done |
| **W7** | Implement `gradeWritingAnswer()` with Claude prompt | `hsk-grading/hsk-grading.service.ts` | Backend | ✅ Done |
| **W7** | Hook async grading into `submitAttempt()` | `attempts.service.ts` | Backend | ✅ Done |
| **W7** | Create `GET /attempts/:id/writing-evaluations` endpoint | `hsk-grading/hsk-grading.controller.ts` | Backend | ✅ Done |
| **W8** | Build `WritingEvaluationPanel` for result page | Inline in `result/page.tsx` | Frontend | ✅ Done (inline) |
| **W8** | Add polling for pending evaluations on result page | `result/page.tsx` | Frontend | ✅ Done |
| **W8** | Build `WritingEvaluationPanel` for admin results | `admin/WritingEvaluationPanel.tsx` | Frontend | ⬜ TODO |
| **W8** | Admin: override AI score + re-grade endpoints | `admin-results/page.tsx` | Frontend | ⬜ TODO |
| **W9** | Create `HskVocabularyModule` with CRUD + bulk import | `hsk-vocabulary/*.ts` | Backend | ✅ Done |
| **W9** | Build admin vocabulary management page | `admin-vocabulary/page.tsx` | Frontend | ⬜ TODO |
| **W9** | Create `nodejieba` tokenizer for vocabulary level analysis | `hsk-grading/tokenizer.ts` | Backend | ⬜ TODO |
| **W9** | E2E: full HSK 5 test → submit → AI grades writing → view rubric | — | QA | ⬜ TODO |

**Deliverable:** Students get detailed AI feedback on writing with grammar errors, vocabulary analysis, and rubric scores. Admins can review and override AI grades.

---

### Phase 4 — Polish & Scale (Weeks 10–12)

| Week | Task | Status |
|---|---|---|
| **W10** | Character set toggle (simplified ↔ traditional) in user preferences | ⬜ TODO |
| **W10** | Seed HSK 1–4 and HSK 6 test templates | ⬜ TODO |
| **W11** | AI-generated mock tests (Claude generates questions → admin review queue) | ⬜ TODO |
| **W11** | Chinese font optimization (Noto Sans SC/TC subset, lazy loading) | ⬜ TODO |
| **W12** | Performance: Redis cache for vocabulary lookups, rate limiting on AI endpoints | ⬜ TODO |
| **W12** | Mobile responsive testing for drag-and-drop reorder | ⬜ TODO |

---

## 9. Automated Testing & QA Loop

### 9.1 CI Workflow

```yaml
# .github/workflows/hsk-qa.yml

name: HSK Module QA
on:
  pull_request:
    paths:
      - 'apps/api/src/hsk-*/**'
      - 'apps/api/src/scoring/**'
      - 'apps/api/src/attempts/**'
      - 'apps/api/prisma/schema.prisma'
      - 'apps/web/src/components/hsk/**'
      - 'apps/web/src/components/question-renderers/**'
      - 'apps/api/prisma/seed*.ts'

jobs:
  hsk-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci

      - name: Prisma Schema Validation
        run: cd apps/api && npx prisma validate

      - name: Sentence Reorder Validator Tests
        run: cd apps/api && npx vitest run tests/hsk/sentence-reorder.test.ts

      - name: Chinese Text Validator Tests
        run: cd apps/api && npx vitest run tests/hsk/chinese-validator.test.ts

      - name: Pinyin-Hanzi Consistency Tests
        run: cd apps/api && npx vitest run tests/hsk/pinyin-consistency.test.ts

      - name: HSK Level Boundary Tests
        run: cd apps/api && npx vitest run tests/hsk/level-boundaries.test.ts

      - name: HSK Scoring Tests
        run: cd apps/api && npx vitest run tests/hsk/scoring.test.ts

      - name: AI Prompt Regression Tests
        run: cd apps/api && npx vitest run tests/hsk/grading-prompt.test.ts

      - name: Frontend Build Check
        run: cd apps/web && npm run build
```

### 9.2 Logic Checks Per PR

| Check | What It Catches | Test File |
|---|---|---|
| **Pinyin-Hanzi match** | Pinyin key doesn't exist in fragments/keywords | `pinyin-consistency.test.ts` |
| **Fragment completeness** | Fragments don't concatenate to `correctAnswer` | `sentence-reorder.test.ts` |
| **HSK level boundary** | HSK 2 question using HSK 5 vocabulary | `level-boundaries.test.ts` |
| **Character count range** | `minChars > maxChars` or negative values | `chinese-validator.test.ts` |
| **Simplified/Traditional parity** | 4 simplified fragments but 3 traditional | `pinyin-consistency.test.ts` |
| **AI prompt structure** | Prompt missing HSK level or keywords | `grading-prompt.test.ts` |
| **Scoring math** | HSK 5 total exceeds 300 or pass threshold wrong | `scoring.test.ts` |
| **Metadata required fields** | `SENTENCE_REORDER` question missing `fragments` | `metadata-validation.test.ts` |

### 9.3 Unit Test: Sentence Reorder Validator

```typescript
// apps/api/tests/hsk/sentence-reorder.test.ts

import { describe, it, expect } from 'vitest';
import { gradeSentenceReorder } from '../../src/hsk-grading/sentence-reorder';

describe('gradeSentenceReorder', () => {
  const q = {
    correctAnswer: '录取结果将在月底公布',
    metadata: { fragments: ['结果将在', '公布', '月底', '录取'] },
  };

  it('exact match → score 1', () => {
    const r = gradeSentenceReorder('录取结果将在月底公布', q);
    expect(r).toEqual({ isCorrect: true, score: 1, feedback: '完全正确！' });
  });

  it('match with trailing period → score 1', () => {
    const r = gradeSentenceReorder('录取结果将在月底公布。', q);
    expect(r.isCorrect).toBe(true);
    expect(r.score).toBe(1);
  });

  it('match with spaces → score 1', () => {
    const r = gradeSentenceReorder('录取 结果将在 月底 公布', q);
    expect(r.isCorrect).toBe(true);
  });

  it('all fragments but wrong order → score 0.5', () => {
    const r = gradeSentenceReorder('公布月底结果将在录取', q);
    expect(r.isCorrect).toBe(false);
    expect(r.score).toBe(0.5);
    expect(r.feedback).toContain('语序');
  });

  it('missing fragments → score 0', () => {
    const r = gradeSentenceReorder('结果将在月底', q);
    expect(r.score).toBe(0);
  });

  it('empty answer → score 0', () => {
    const r = gradeSentenceReorder('', q);
    expect(r.score).toBe(0);
  });

  it('null answer → score 0', () => {
    const r = gradeSentenceReorder(null, q);
    expect(r.score).toBe(0);
  });

  it('handles overlapping characters correctly', () => {
    const q2 = {
      correctAnswer: '汽油的价格又上涨了',
      metadata: { fragments: ['汽油的', '上涨', '价格', '又', '了'] },
    };
    const r = gradeSentenceReorder('汽油的价格又上涨了', q2);
    expect(r.isCorrect).toBe(true);
  });
});
```

### 9.4 Unit Test: Chinese Validator

```typescript
// apps/api/tests/hsk/chinese-validator.test.ts

import { describe, it, expect } from 'vitest';
import { countHanzi, isValidChineseInput, checkKeywordsUsed } from '../../src/hsk-grading/chinese-validator';

describe('countHanzi', () => {
  it('counts CJK characters only', () => {
    expect(countHanzi('我去了博物馆。')).toBe(6);          // excludes 。
  });
  it('excludes punctuation and spaces', () => {
    expect(countHanzi('你好，世界！')).toBe(4);             // excludes ，！
  });
  it('returns 0 for empty string', () => {
    expect(countHanzi('')).toBe(0);
  });
  it('returns 0 for ASCII-only string', () => {
    expect(countHanzi('hello world')).toBe(0);
  });
  it('handles mixed CJK and ASCII', () => {
    expect(countHanzi('我是HSK5级')).toBe(4);              // 我是级 + 5 is digit
  });
});

describe('checkKeywordsUsed', () => {
  const keywords = ['博物馆', '保存', '讲解员', '丰富', '值得'];

  it('all present → allPresent: true', () => {
    const text = '博物馆里保存着丰富的文物，讲解员说值得一看。';
    const r = checkKeywordsUsed(text, keywords);
    expect(r.allPresent).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('some missing → lists missing', () => {
    const text = '博物馆里保存着丰富的文物。';
    const r = checkKeywordsUsed(text, keywords);
    expect(r.allPresent).toBe(false);
    expect(r.missing).toEqual(['讲解员', '值得']);
  });

  it('none present → all missing', () => {
    const r = checkKeywordsUsed('今天天气很好。', keywords);
    expect(r.missing).toEqual(keywords);
  });
});
```

### 9.5 Unit Test: HSK Scoring

```typescript
// apps/api/tests/hsk/scoring.test.ts

import { describe, it, expect } from 'vitest';
import { ScoringService } from '../../src/scoring/scoring.service';

describe('HSK Scoring', () => {
  const service = new ScoringService();

  it('HSK 1-2: 200 total, pass at 120', () => {
    const result = service.calculateHskScores([
      { skill: 'LISTENING', correct: 15, total: 20 },
      { skill: 'READING', correct: 12, total: 20 },
    ], 'HSK_1');

    expect(result.sectionScores['LISTENING']).toBe(75);
    expect(result.sectionScores['READING']).toBe(60);
    expect(result.scaledScore).toBe(135);
    expect(result.passed).toBe(true);   // 135 >= 120
  });

  it('HSK 5: 300 total, pass at 180', () => {
    const result = service.calculateHskScores([
      { skill: 'LISTENING', correct: 30, total: 45 },
      { skill: 'READING', correct: 28, total: 45 },
      { skill: 'WRITING', correct: 0, total: 0, writingScore: 70 },
    ], 'HSK_5');

    expect(result.sectionScores['LISTENING']).toBe(67);
    expect(result.sectionScores['READING']).toBe(62);
    expect(result.sectionScores['WRITING']).toBe(70);
    expect(result.scaledScore).toBe(199);
    expect(result.passed).toBe(true);   // 199 >= 180
  });

  it('fails when below 60%', () => {
    const result = service.calculateHskScores([
      { skill: 'LISTENING', correct: 5, total: 20 },
      { skill: 'READING', correct: 5, total: 20 },
    ], 'HSK_2');

    expect(result.scaledScore).toBe(50);
    expect(result.passed).toBe(false);  // 50 < 120
  });
});
```

---

## 10. Technical Specification

### 10.1 New Dependencies

| Package | Layer | Purpose |
|---|---|---|
| `@anthropic-ai/sdk` | Backend | Claude API for writing evaluation |
| `nodejieba` | Backend | Chinese word segmentation for vocabulary analysis |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Frontend | Drag-and-drop for sentence reorder |

### 10.2 Chinese Tokenization

Chinese has no word boundaries. Tokenization needed for:

| Use Case | Approach | Library |
|---|---|---|
| Character counting | Regex: `/[\u4e00-\u9fff]/g` | None needed |
| Keyword detection | `String.includes()` | None needed |
| Vocabulary level analysis | Word segmentation → DB lookup | `nodejieba` (server) |

```typescript
// apps/api/src/hsk-grading/tokenizer.ts
import nodejieba from 'nodejieba';

export function tokenizeAndClassify(
  text: string,
  vocabMap: Map<string, number>,  // word → HSK level
): { word: string; hskLevel: number | null }[] {
  return nodejieba.cut(text).map(word => ({
    word,
    hskLevel: vocabMap.get(word) ?? null,
  }));
}
```

### 10.3 Environment Variables (New)

```env
# apps/api/.env — add these
ANTHROPIC_API_KEY=sk-ant-...               # For Claude AI grading
ANTHROPIC_MODEL=claude-sonnet-4-6       # Grading model
```

### 10.4 S3 Asset Structure

```
s3://{bucket}/
├── hsk/
│   ├── 1/audio/           # HSK 1 listening audio files
│   ├── 2/audio/
│   ├── 3/audio/
│   ├── 4/audio/
│   ├── 5/
│   │   ├── audio/         # HSK 5 listening (45 files)
│   │   └── images/        # HSK 5 reading + writing images
│   └── 6/
│       ├── audio/
│       └── images/
└── vocabulary/
    └── hsk-1-6.csv        # Bulk import source
```

### 10.5 Performance

| Concern | Solution |
|---|---|
| AI grading latency (3–5s) | Async after submit; poll on result page (3s interval) |
| Vocabulary lookups (5000 words) | Load full table into `Map` on module init; refresh on seed |
| `nodejieba` cold start (~200ms) | Load once in `OnModuleInit` |
| Chinese font rendering | `Noto Sans SC` via Google Fonts, `font-display: swap` |
| Audio files (45 per test) | Pre-signed S3 URLs, lazy-load on section enter |

### 10.6 Complete File Manifest

```
# ═══ BACKEND (apps/api/) ═══

# Changed files
prisma/schema.prisma                       # Add enums, metadata, WritingEvaluation, HskVocabulary
src/admin/dto/create-test.dto.ts           # Add metadata to CreateQuestionDto
src/admin/admin-tests.service.ts           # Add HSK templates to createFromTemplate()
src/attempts/attempts.service.ts           # Add SENTENCE_REORDER + async AI grading branches
src/scoring/scoring.service.ts             # Add calculateHskScores()

# New files
src/hsk-grading/
├── hsk-grading.module.ts                  # Module registration
├── hsk-grading.service.ts                 # AI grading orchestration
├── hsk-grading.controller.ts              # GET /attempts/:id/writing-evaluations
├── sentence-reorder.ts                    # Deterministic reorder grading
├── chinese-validator.ts                   # countHanzi, isValidChineseInput, checkKeywordsUsed
├── tokenizer.ts                           # nodejieba wrapper
└── prompts/
    └── writing-system-prompt.ts           # Claude system prompt

src/anthropic/
├── anthropic.module.ts                    # Anthropic SDK wrapper module
└── anthropic.service.ts                   # @anthropic-ai/sdk client

src/hsk-vocabulary/
├── hsk-vocabulary.module.ts
├── hsk-vocabulary.service.ts              # CRUD + bulk import
└── hsk-vocabulary.controller.ts           # Admin + public endpoints

prisma/seeds/
├── hsk5-test.ts                           # Full HSK 5 test (100 questions)
└── hsk-vocabulary.ts                      # HSK 1-6 vocabulary lists

tests/hsk/
├── sentence-reorder.test.ts
├── chinese-validator.test.ts
├── pinyin-consistency.test.ts
├── level-boundaries.test.ts
├── scoring.test.ts
└── grading-prompt.test.ts

# ═══ FRONTEND (apps/web/) ═══

# Changed files
src/app/(learner)/tests/page.tsx                     # Add HSK category tab
src/app/(learner)/tests/[id]/result/page.tsx          # Add writing evaluation display + polling
src/app/(admin)/admin-tests/new/page.tsx              # Add HSK exam types
src/app/(admin)/admin-tests/[id]/edit/page.tsx        # Add HSK question type editors
src/app/(admin)/admin-questions/page.tsx              # Add HSK filters
src/app/(admin)/admin-results/page.tsx                # Add writing evaluation panel
src/components/question-renderers/index.tsx           # Add 3 new question type cases
src/components/attempt-layouts/layout-router.tsx      # Add writing layout detection

# New files
src/components/question-renderers/
├── sentence-reorder-renderer.tsx                     # Drag-and-drop + text input
├── keyword-composition-renderer.tsx                  # Keywords + textarea + counter
└── picture-composition-renderer.tsx                  # Image + textarea + counter

src/components/attempt-layouts/
└── writing-questions.tsx                             # Full-width writing layout

src/components/hsk/
├── PinyinText.tsx                                    # <ruby> pinyin annotations
├── FragmentChip.tsx                                  # Draggable word chip
├── CharacterCounter.tsx                              # Hanzi count display
├── KeywordChecklist.tsx                              # Real-time keyword tracker
└── WritingEvaluationPanel.tsx                        # Rubric breakdown display

src/components/admin/
├── SentenceReorderEditor.tsx                         # Admin: create reorder questions
├── CompositionEditor.tsx                             # Admin: create composition questions
└── WritingEvaluationPanel.tsx                        # Admin: view/override AI grades

src/app/(admin)/
└── admin-vocabulary/
    └── page.tsx                                      # HSK vocabulary management

src/lib/
└── chinese-utils.ts                                  # countHanzi, checkKeywordsUsed (frontend)
```

---

## Appendix A: HSK 5 Full Test Structure (Reference)

```
Test: "HSK 5 模拟考试 1" (examType: HSK_5, durationMins: 125)

├── Section 1: 听力 Listening (skill: LISTENING, 45 questions)
│   ├── Part 1 (Q1-20):  Short dialogues, 1 question each
│   │   └── 20x QuestionGroup (type: MULTIPLE_CHOICE, audioUrl: per-group)
│   │       └── 1x Question each (options: A/B/C/D in Chinese)
│   ├── Part 2 (Q21-25): Extended dialogues, 1 question each
│   │   └── 5x QuestionGroup (type: MULTIPLE_CHOICE, audioUrl: per-group)
│   └── Part 3 (Q26-45): Long passages, 2-4 questions per audio
│       └── ~8x QuestionGroup (type: MULTIPLE_CHOICE, audioUrl: shared)
│           └── 2-4x Questions each
│
├── Section 2: 阅读 Reading (skill: READING, 45 questions)
│   ├── Part 1 (Q46-60): Fill-in-blank passages
│   │   ├── Passage (contentHtml with {46}...{60} tokens)
│   │   └── QuestionGroup (type: MULTIPLE_CHOICE)
│   │       └── 15x Questions (options: A/B/C/D word choices)
│   ├── Part 2 (Q61-70): Paragraph matching
│   │   └── QuestionGroup (type: MATCHING_INFORMATION)
│   └── Part 3 (Q71-90): Reading comprehension
│       ├── Passage (contentHtml + imageUrl)
│       └── QuestionGroup (type: MULTIPLE_CHOICE)
│           └── Questions with stems (e.g. "狮子为什么拒绝了老鼠的挑战?")
│
├── Section 3: 书写 Part 1 (skill: WRITING, 8 questions)
│   └── QuestionGroup (type: SENTENCE_REORDER)
│       ├── Q91 (metadata: { fragments: ["结果将在","公布","月底","录取"] })
│       ├── Q92 (metadata: { fragments: ["他","自信","承认自己","缺乏"] })
│       ├── Q93 (metadata: { fragments: ["参加其他优惠","打折商品","活动","不再"] })
│       ├── Q94 (metadata: { fragments: ["汽油的","上涨","价格","又","了"] })
│       └── ... (Q95-Q98)
│
└── Section 4: 书写 Part 2 (skill: WRITING, 2 questions)
    ├── QuestionGroup (type: KEYWORD_COMPOSITION)
    │   └── Q99 (stem: "请结合下列词语...", metadata: { keywords: ["博物馆","保存","讲解员","丰富","值得"] })
    └── QuestionGroup (type: PICTURE_COMPOSITION, imageUrl: "wedding-hands.jpg")
        └── Q100 (stem: "请结合这张图片写一篇80字左右的短文。", metadata: { minChars:60, maxChars:100 })
```

---

## Appendix B: Comparison with IELTS/TOEIC

| Feature | IELTS | TOEIC | HSK |
|---|---|---|---|
| **Exam subtypes** | Academic, General | L&R, S&W | Level 1–6 |
| **Scoring** | Band 1.0–9.0 | Scaled 10–990 | Scaled 0–200/300 |
| **Pass/Fail** | No pass line | No pass line | 60% = pass |
| **Question types** | 12 types | 8 types | 3 new + shared MCQ |
| **Writing grading** | Manual/AI rubric | Manual/AI rubric | AI rubric (same infra) |
| **Language** | English | English | Chinese (Simplified/Traditional) |
| **Special UI** | — | — | Pinyin, drag-and-drop, hanzi counter |
| **Grading** | String match | String match | String match + AI |
| **Audio** | Per-section | Per-section | Per-question (Part 1-2), per-group (Part 3) |
