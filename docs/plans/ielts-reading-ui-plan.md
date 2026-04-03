# Universal Test Attempt UI — Full Plan (All Exam Types)

## Context

The platform supports many exam types: IELTS, TOEIC, TOPIK, JLPT, HSK, THPTQG (Vietnamese national exam), SAT, ACT. Each has distinct UI requirements. The current attempt page uses a basic single-column layout. This plan defines a **layout system** that automatically adapts to the exam/section type, covering:

- Two-column passage+questions (IELTS Reading, TOEIC Part 7)
- Single-column questions-only (THPTQG Math/Physics, TOEIC Part 5/6, TOPIK Reading)
- Audio + image grid + questions (TOPIK/JLPT Listening)
- Math formula rendering (THPTQG, SAT)
- Rich content in stems and options (HTML, LaTeX, images)

---

## Layout Matrix — Which exam gets which layout

| Exam Type | Section | Layout | Key Features |
|-----------|---------|--------|-------------|
| IELTS Academic/General | Reading | `PASSAGE_QUESTIONS` | Two-col split, long passages (A-F paragraphs), highlight toggle |
| IELTS Academic/General | Listening | `AUDIO_QUESTIONS` | Audio player top, questions below, single-col |
| TOEIC LR | Part 5/6 (Reading) | `QUESTIONS_ONLY` | Single-col MCQ, sentence completion, sidebar nav+timer |
| TOEIC LR | Part 7 (Reading) | `PASSAGE_QUESTIONS` | Two-col, short passages (emails, chats, notices) + MCQ |
| TOEIC LR | Listening | `AUDIO_QUESTIONS` | Audio player + MCQ |
| TOPIK I/II | Listening | `AUDIO_VISUAL` | Audio player + image grid (4 pictures) + MCQ |
| TOPIK I/II | Reading | `QUESTIONS_ONLY` | Single-col, fill-in-blank, underlined text, MCQ |
| JLPT N1-N5 | Listening | `AUDIO_VISUAL` | Audio + optional images + MCQ |
| JLPT N1-N5 | Reading | `PASSAGE_QUESTIONS` | Two-col, Japanese text passages + MCQ |
| HSK 1-6 | Listening | `AUDIO_VISUAL` | Audio + optional images + MCQ |
| HSK 1-6 | Reading | `QUESTIONS_ONLY` | Single-col, sentence MCQ |
| THPTQG | Any subject | `QUESTIONS_ONLY` | Single-col MCQ, **math/formula rendering** (KaTeX) |
| Digital SAT | Math | `QUESTIONS_ONLY` | Single-col MCQ + grid-in, **math rendering** |
| Digital SAT | Reading | `PASSAGE_QUESTIONS` | Two-col, passage + MCQ |
| ACT | Math | `QUESTIONS_ONLY` | Single-col MCQ, math rendering |
| ACT | Reading/Science | `PASSAGE_QUESTIONS` | Two-col, passage + MCQ |

---

## Step 0: Schema Changes

### 0a: Add `SectionSkill` values for general subjects

**File:** `apps/api/prisma/schema.prisma`

The current `SectionSkill` only has `LISTENING, READING, WRITING, SPEAKING`. For THPTQG/SAT/ACT we need general subjects. Two approaches:

**Option A (recommended):** Add a `layoutType` field to `TestSection` so layout is explicit, not derived from skill:

```prisma
enum LayoutType {
  PASSAGE_QUESTIONS   // Two-column: passage left, questions right
  QUESTIONS_ONLY      // Single-column: questions only (with optional sidebar)
  AUDIO_QUESTIONS     // Audio player + questions (single-col)
  AUDIO_VISUAL        // Audio + images + questions
}

model TestSection {
  ...
  passageHtml   String?      // Reading passage content (HTML, supports LaTeX via KaTeX markers)
  audioUrl      String?      // Audio file URL for listening sections
  layoutType    LayoutType   @default(QUESTIONS_ONLY)  // NEW: determines attempt UI layout
  imageUrls     Json?        // NEW: array of image URLs for visual questions (TOPIK listening etc.)
  ...
}
```

**Option B:** Keep inferring layout from `skill` + `examType`. This couples UI to business logic — not recommended.

### 0b: Add `FILL_IN_BLANK` to `QuestionType`

```prisma
enum QuestionType {
  MULTIPLE_CHOICE
  FILL_IN_BLANK          // NEW: sentence with blank, choose correct word/phrase
  NOTE_FORM_COMPLETION
  TABLE_COMPLETION
  SUMMARY_COMPLETION
  MATCHING
}
```

### 0c: Rich content fields

The existing `stem` (String?) and `mcqOptions` (Json?) fields are sufficient if we treat them as **HTML strings that may contain KaTeX delimiters**. No schema change needed — just render them with a rich content component.

Convention:
- Inline math: `\\(x^2 + y^2 = r^2\\)`
- Display math: `\\[\\frac{u_R^2}{U_{0R}^2} + \\frac{u_L^2}{U_{0L}^2} = 1\\]`
- Images in stems: `<img src="..." />` tags in the HTML

Run: `npx prisma migrate dev --name add_layout_type_and_fill_in_blank`

---

## Step 1: Schema — Add `passageHtml`, `layoutType`, `imageUrls` to `TestSection`

**File:** `apps/api/prisma/schema.prisma`

(Covered in Step 0a above)

---

## Step 2: Backend API — Support new fields in CRUD

### 2a: DTO updates
**File:** `apps/api/src/admin/dto/create-test.dto.ts`
- Add `@IsOptional() @IsString() passageHtml?: string` to `CreateSectionDto`
- Add `@IsOptional() @IsEnum(LayoutType) layoutType?: LayoutType` to `CreateSectionDto`
- Add `@IsOptional() imageUrls?: string[]` to `CreateSectionDto`

### 2b: Admin Tests Service
**File:** `apps/api/src/admin/admin-tests.service.ts`
- Pass `passageHtml`, `layoutType`, `imageUrls` in section create/update

### 2c-2d: Public/Attempts services
- Verify these new fields are returned in queries (Prisma auto-includes scalars)

---

## Step 3: Install Frontend Dependencies

**Directory:** `apps/web/`

```bash
# Tiptap for rich text passage editing/viewing
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-highlight @tiptap/pm

# KaTeX for math formula rendering
npm install katex
npm install -D @types/katex
```

**Why these libraries:**
- **Tiptap**: Rich text editor for admin passage authoring + read-only viewer for learners with highlight support
- **KaTeX**: Fast math rendering for THPTQG/SAT/ACT formulas. Lighter than MathJax (~100KB vs ~500KB)

---

## Step 4: Shared Components

### 4a: Rich Content Renderer
**File:** `web/src/components/rich-content.tsx` (NEW)

Renders HTML strings that may contain KaTeX math delimiters and images:

```tsx
interface RichContentProps {
  html: string;
  className?: string;
}
```

- Parses HTML string
- Finds `\(...\)` and `\[...\]` delimiters → renders with KaTeX
- Renders `<img>` tags as Next.js `<Image>` or standard `<img>`
- Used everywhere: question stems, MCQ options, passage content, group instructions

### 4b: Tiptap Editor Component
**File:** `web/src/components/tiptap-editor.tsx` (NEW)

```tsx
interface TiptapEditorProps {
  content: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  className?: string;
}
```

- Admin mode (`editable: true`): toolbar with Bold, Italic, Heading, List, Highlight
- Learner mode (`editable: false`): read-only with highlight toggle
- Serif font for passage display

### 4c: Question Navigator Sidebar
**File:** `web/src/components/question-navigator.tsx` (NEW)

Shared across ALL layouts — always appears on the right edge:

```
┌──────────────┐
│  Timer: 85:00 │
│  [NỘP BÀI]   │
│               │
│  Part 5       │
│  [101][102]...│
│  [106][107]...│
│  ...          │
│               │
│  Part 6       │
│  [131][132]...│
└──────────────┘
```

- Groups questions by section/part
- Color states: answered (blue/green fill), unanswered (white), current (highlighted border)
- Click to jump to question (scrolls the question panel)
- Timer countdown + Submit button
- Sticky/fixed position on right side

---

## Step 5: Layout Components

### 5a: Layout Router
**File:** `web/src/components/attempt-layouts/layout-router.tsx` (NEW)

Reads `activeSection.layoutType` and renders the correct layout:

```tsx
switch (section.layoutType) {
  case 'PASSAGE_QUESTIONS': return <PassageQuestionsLayout ... />;
  case 'QUESTIONS_ONLY':    return <QuestionsOnlyLayout ... />;
  case 'AUDIO_QUESTIONS':   return <AudioQuestionsLayout ... />;
  case 'AUDIO_VISUAL':      return <AudioVisualLayout ... />;
}
```

### 5b: `PASSAGE_QUESTIONS` Layout (IELTS Reading, TOEIC Part 7, SAT Reading)
**File:** `web/src/components/attempt-layouts/passage-questions.tsx` (NEW)

```
┌─────────────────────────────────────────────────────────┐
│ [Highlight ☐]  │  Passage 1  │  Passage 2  │ ...       │
├─────────────────┴─────────────┴─────────────────────────┤
│                    │                    │  Timer    │
│   LEFT COLUMN      │   RIGHT COLUMN     │  Submit   │
│   (passage)        │   (questions)      │  Q-nav    │
│   - Tiptap viewer  │   - MCQ radios     │  [1][2]   │
│   - Rich content   │   - Fill inputs    │  [3][4]   │
│   - Independently  │   - Independently  │  ...      │
│     scrollable     │     scrollable     │           │
└────────────────────┴────────────────────┴───────────┘
```

- Left column: `TiptapEditor` (read-only) or `RichContent` renderer for `passageHtml`
- Right column: question groups rendered sequentially
- Both columns independently scrollable (`overflow-y: auto`, `h-screen`)
- Highlight toggle on passage
- Section tabs to switch between passages

### 5c: `QUESTIONS_ONLY` Layout (THPTQG, TOEIC Part 5, TOPIK Reading, HSK)
**File:** `web/src/components/attempt-layouts/questions-only.tsx` (NEW)

```
┌─────────────────────────────────────────────────────────┐
│  [Part 1]  [Part 2]  [Part 3]  ...                      │
├─────────────────────────────────────────┬───────────────┤
│                                         │  Timer    │
│   MAIN COLUMN (scrollable)              │  Submit   │
│                                         │           │
│   1. Question stem (rich content)       │  Part 1   │
│      ○ A. option (may have LaTeX)       │  [1][2]   │
│      ○ B. option                        │  [3][4]   │
│      ○ C. option                        │  ...      │
│      ○ D. option                        │           │
│   ─────────────────────                 │  Part 2   │
│   2. Question stem ...                  │  [31]...  │
│      ○ A. ...                           │           │
│                                         │           │
└─────────────────────────────────────────┴───────────┘
```

- Single scrollable column for questions
- Each question: number badge (colored) + stem + radio options
- Stems and options rendered via `RichContent` (supports LaTeX, images)
- Divider between questions
- Question navigator sidebar on right

### 5d: `AUDIO_QUESTIONS` Layout (IELTS Listening, TOEIC Listening)
**File:** `web/src/components/attempt-layouts/audio-questions.tsx` (NEW)

```
┌─────────────────────────────────────────────────────────┐
│  ▶ ───────●────────────────────────── 00:00  🔊        │
├─────────────────────────────────────────┬───────────────┤
│                                         │  Timer    │
│   QUESTIONS (scrollable)                │  Submit   │
│   1. What did the speaker say?          │  Q-nav    │
│      ○ A. ...                           │           │
│      ○ B. ...                           │           │
│                                         │           │
└─────────────────────────────────────────┴───────────┘
```

- Audio player fixed at top (play/pause, seek bar, time, volume)
- Questions below in scrollable area
- No passage column

### 5e: `AUDIO_VISUAL` Layout (TOPIK Listening, JLPT Listening, HSK Listening)
**File:** `web/src/components/attempt-layouts/audio-visual.tsx` (NEW)

```
┌─────────────────────────────────────────────────────────┐
│  ▶ ───────●────────────────────────── 00:00  🔊        │
├─────────────────────────────────────────┬───────────────┤
│                                         │  Timer    │
│   ┌──────┐ ┌──────┐                    │  Submit   │
│   │ ①    │ │ ②    │  ← image grid      │  Q-nav    │
│   └──────┘ └──────┘                    │           │
│   ┌──────┐ ┌──────┐                    │           │
│   │ ③    │ │ ④    │                    │           │
│   └──────┘ └──────┘                    │           │
│                                         │           │
│   1. 다음을 듣고 알맞은 그림을 고르시오.    │           │
│      ○ A. ①  ○ B. ②  ○ C. ③  ○ D. ④   │           │
│                                         │           │
└─────────────────────────────────────────┴───────────┘
```

- Audio player fixed at top
- Image grid (2x2 or flexible) from `section.imageUrls` or from question-level images
- Images can also be embedded per-question via `stem` HTML (e.g. `<img>` tags)
- Questions with MCQ below images
- Some questions may not have images — just MCQ under audio

---

## Step 6: Question Renderers

### 6a: MCQ Renderer (used across all layouts)
**File:** `web/src/components/question-renderers/mcq-renderer.tsx` (NEW)

```tsx
interface McqRendererProps {
  question: Question;
  selectedAnswer: string | null;
  onAnswer: (questionId: string, answer: string) => void;
}
```

- Question number badge (colored, e.g. blue circle)
- Stem rendered via `RichContent` (supports LaTeX, images, HTML)
- Options as radio buttons, each option rendered via `RichContent`
- Selected state styling
- Supports both vertical (default) and horizontal option layouts

### 6b: Fill-in-Blank Renderer
**File:** `web/src/components/question-renderers/fill-in-blank-renderer.tsx` (NEW)

For TOEIC Part 5/6 style: "A _____ salesperson assisted Ms. Han..."
- Renders the sentence with a visible blank
- MCQ options below (radio buttons)
- Stem contains the sentence with blank marker

### 6c: Existing renderers (already planned)
- **Note/Form Completion**: text input fields
- **Table Completion**: table with input blanks
- **Summary Completion**: paragraph with input blanks
- **Matching**: dropdown or input fields
- **Heading Matching**: list of headings + input mapping

---

## Step 7: Admin Frontend — Section Editor Updates

### 7a: Layout Type Selector
**File:** `web/src/app/(admin)/admin-tests/[id]/edit/page.tsx`

When editing a section, show a **Layout Type** dropdown:
- Auto-set based on `examType` + `skill` when creating a new section (use Layout Matrix above)
- Admin can override manually
- Changing layout type shows/hides relevant fields:
  - `PASSAGE_QUESTIONS` → show Passage Editor (Tiptap)
  - `AUDIO_QUESTIONS` → show Audio URL field
  - `AUDIO_VISUAL` → show Audio URL + Image URLs fields
  - `QUESTIONS_ONLY` → no extra fields (just questions)

### 7b: Image URLs Editor
For `AUDIO_VISUAL` sections, show an image URL list editor:
- Add/remove image URLs
- Preview thumbnails
- Drag to reorder

### 7c: Math Content Guidance
For THPTQG/SAT/ACT exam types, show a hint in the question editor:
- "Use `\(...\)` for inline math and `\[...\]` for display math"
- Live preview of rendered math in stem/options

---

## Step 8: Attempt Page Integration

**File:** `web/src/app/(learner)/tests/[id]/attempt/page.tsx`

### 8a: Replace current layout with Layout Router
- Import `LayoutRouter` component
- Pass `activeSection`, `questions`, `answers`, `onAnswer` callbacks
- `LayoutRouter` selects the correct layout based on `section.layoutType`

### 8b: Section tabs
- Render section/part tabs at the top
- Clicking a tab switches `activeSection` and re-renders the correct layout
- Tab labels: "Part 1", "Passage 1", "Listening", etc. (from `section.title`)

### 8c: State management unchanged
- Existing answer state, auto-save, timer, and submit logic remain the same
- Layouts just receive props and call callbacks — no new state management needed

---

## Step 9: Seed Data — Multi-Exam Samples

**File:** `apps/api/prisma/seed.ts`

### 9a: IELTS Reading Test (existing, enhance)
- 3 sections with `layoutType: PASSAGE_QUESTIONS`
- Each section: `passageHtml` with labeled paragraphs (A-F), ~500-800 words
- Mixed question groups per section

### 9b: TOEIC LR Test (existing, enhance)
- Part 5 section: `layoutType: QUESTIONS_ONLY`, 30 FILL_IN_BLANK questions
- Part 7 section: `layoutType: PASSAGE_QUESTIONS`, short passages + MCQ

### 9c: THPTQG Physics Test (NEW)
- 1 section: `layoutType: QUESTIONS_ONLY`
- 40 MCQ questions with LaTeX formulas in stems and options
- Example stem: `Trên sợi dây đàn hai đầu cố định, dài \\(l = 100\\) cm...`
- Example option: `\\(\\frac{u_R^2}{U_{0R}^2} + \\frac{u_L^2}{U_{0L}^2} = 1\\)`

### 9d: TOPIK Listening Test (NEW, optional)
- Section with `layoutType: AUDIO_VISUAL`
- Questions with image URLs in stems
- `audioUrl` pointing to sample audio

---

## Step 10: Styling

### Global attempt styles
- Clean white background
- Consistent question numbering (colored number badges)
- Dividers between questions
- Focus/active states on inputs and radio buttons

### Layout-specific styles
- **PASSAGE_QUESTIONS**: Soft 1px border between columns, serif font for passage, `line-height: 1.75`
- **QUESTIONS_ONLY**: Centered content column (max-width ~800px), generous spacing
- **AUDIO_***: Audio player with custom styling (progress bar, time display)
- **Navigator sidebar**: Fixed right, subtle background, compact question grid

### Math rendering
- KaTeX CSS imported globally
- Inline math flows with text
- Display math centered with margin

---

## Critical Files to Modify/Create

| File | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Add `LayoutType` enum, `passageHtml`, `layoutType`, `imageUrls` to TestSection; add `FILL_IN_BLANK` to QuestionType |
| `apps/api/src/admin/dto/create-test.dto.ts` | Add new fields to CreateSectionDto |
| `apps/api/src/admin/admin-tests.service.ts` | Include new fields in section CRUD |
| `apps/web/package.json` | Add Tiptap + KaTeX dependencies |
| `web/src/components/rich-content.tsx` | **NEW** — HTML + KaTeX + image renderer |
| `web/src/components/tiptap-editor.tsx` | **NEW** — Tiptap wrapper (admin edit + learner read-only) |
| `web/src/components/question-navigator.tsx` | **NEW** — Shared sidebar (timer, submit, question grid) |
| `web/src/components/attempt-layouts/layout-router.tsx` | **NEW** — Layout switcher |
| `web/src/components/attempt-layouts/passage-questions.tsx` | **NEW** — Two-column layout |
| `web/src/components/attempt-layouts/questions-only.tsx` | **NEW** — Single-column layout |
| `web/src/components/attempt-layouts/audio-questions.tsx` | **NEW** — Audio + questions layout |
| `web/src/components/attempt-layouts/audio-visual.tsx` | **NEW** — Audio + images + questions layout |
| `web/src/components/question-renderers/mcq-renderer.tsx` | **NEW** — MCQ with rich content |
| `web/src/components/question-renderers/fill-in-blank-renderer.tsx` | **NEW** — Sentence completion |
| `web/src/app/(admin)/admin-tests/[id]/edit/page.tsx` | Layout type selector, conditional fields |
| `web/src/app/(learner)/tests/[id]/attempt/page.tsx` | Replace layout with LayoutRouter |
| `web/src/features/admin/types/index.ts` | Add new fields to types |
| `web/src/lib/admin-api.ts` | Add new fields to payloads |
| `apps/api/prisma/seed.ts` | Multi-exam seed data with formulas, passages |

## Files to Verify (likely no changes)
| File | Check |
|------|-------|
| `apps/api/src/tests/tests.service.ts` | New fields returned in queries |
| `apps/api/src/attempts/attempts.service.ts` | New fields in attempt query |

---

## Implementation Order (Suggested)

1. **Schema + migration** (Step 0-1) — foundation for everything
2. **Backend API** (Step 2) — DTO + service updates
3. **Install deps** (Step 3) — Tiptap + KaTeX
4. **Rich Content renderer** (Step 4a) — needed by all layouts
5. **Question Navigator** (Step 4c) — shared sidebar
6. **QUESTIONS_ONLY layout** (Step 5c) — simplest, covers THPTQG/TOEIC P5/TOPIK Reading
7. **MCQ + Fill-in-Blank renderers** (Step 6a-6b) — needed by above
8. **PASSAGE_QUESTIONS layout** (Step 5b) — IELTS/TOEIC P7/SAT Reading
9. **Tiptap editor** (Step 4b) — needed by above
10. **AUDIO_QUESTIONS layout** (Step 5d) — IELTS/TOEIC Listening
11. **AUDIO_VISUAL layout** (Step 5e) — TOPIK/JLPT Listening
12. **Admin editor updates** (Step 7) — layout type selector, conditional fields
13. **Seed data** (Step 9) — test all layouts
14. **Styling polish** (Step 10)

---

## Verification

1. `npx prisma migrate dev` — migration succeeds
2. `npx prisma db seed` — seed with multi-exam data succeeds
3. **QUESTIONS_ONLY**: Start a THPTQG Physics test → single-column MCQ with rendered math formulas, sidebar with timer and question nav
4. **PASSAGE_QUESTIONS**: Start an IELTS Reading test → two-column layout, passage scrolls independently, highlight toggle works
5. **PASSAGE_QUESTIONS**: Start a TOEIC Part 7 → short passages (emails, chats) on left, MCQ on right
6. **AUDIO_QUESTIONS**: Start an IELTS Listening test → audio player at top, questions below
7. **AUDIO_VISUAL**: Start a TOPIK Listening test → audio player + image grid + MCQ
8. **Cross-layout**: Question navigator works in all layouts (answered/unanswered states, click to jump)
9. **Cross-layout**: Timer and submit work in all layouts
10. **Cross-layout**: Section tabs switch layouts correctly when test has mixed section types
11. **Admin**: Create test → select layout type → relevant fields appear → save → data persists
12. **Admin**: Math preview renders correctly in question editor for THPTQG
13. **Mobile**: All layouts are responsive (stack columns on narrow screens)
