# Admin Redesign Plan — IELTS & TOEIC Exam Management

> **Date:** 2026-03-25
> **Status:** Draft
> **Scope:** Simplify admin UI/UX + API for IELTS and TOEIC only

---

## Table of Contents

1. [Problems with Current System](#1-problems-with-current-system)
2. [Exam Structure Reference](#2-exam-structure-reference)
3. [New Data Structure](#3-new-data-structure)
4. [Updated API Design](#4-updated-api-design)
5. [UI/UX Improvements](#5-uiux-improvements)
6. [Migration Approach](#6-migration-approach)
7. [Implementation Tasks](#7-implementation-tasks)

---

## 1. Problems with Current System

### Data Model Issues
| Problem | Impact |
|---------|--------|
| Generic `QuestionGroup.contentHtml` with `{n}` tokens | Confusing for admins — they must manually embed placeholders in HTML |
| `matchingOptions` is an untyped JSON blob | No validation, easy to create broken matching questions |
| `mcqOptions` is an untyped JSON blob | No schema enforcement for option labels (A/B/C/D) |
| Single `correctAnswer` string field | Ambiguous for multi-answer questions (matching has multiple pairs) |
| `TestSection.passageHtml` + `QuestionGroup.contentHtml` overlap | Unclear where the passage text should go |
| `LayoutType` enum adds unnecessary complexity | Admin must understand abstract layout concepts (PASSAGE_QUESTIONS, AUDIO_VISUAL) |
| `TestFormat` enum (FULL/CONDENSED) | Unnecessary — duration + question count already define format |
| Unused ExamType values still in frontend types | THPTQG, HSK, TOPIK etc. clutter dropdowns |

### API Issues
| Problem | Impact |
|---------|--------|
| `PUT /admin/tests/:id` deletes ALL children and recreates | Loses question IDs, breaks UserAnswer foreign keys, slow |
| No partial update — must send entire test tree | Editing one question requires re-uploading everything |
| No dedicated section/group/question CRUD | Can't add a single question without full test re-save |
| `POST /admin/tests` accepts deeply nested body | Complex payload, hard to validate, error messages are vague |
| No test duplication endpoint | Admins must manually recreate similar tests |
| No question reorder endpoint | Must re-save entire test to change question order |
| No import/export | Can't bulk-create tests from spreadsheets |

### UI/UX Issues
| Problem | Impact |
|---------|--------|
| Test editor is a single massive page | Overwhelming — tree sidebar + form panel + multiple modals |
| No guided workflow for test creation | Admin must understand the hierarchy (Test→Section→Group→Question) upfront |
| Question types not mapped to exam types | Admin can add "Speaking" questions to a Reading test |
| No templates for standard exam structures | Admin must manually create 4 IELTS Listening sections every time |
| TiptapEditor for passages is too complex | Non-technical users struggle with HTML formatting |
| No preview mode | Admin can't see how the test looks to students |
| No bulk operations | Can't delete/move multiple questions at once |

---

## 2. Exam Structure Reference

### IELTS Academic/General — Listening (same for both)
```
Test (30 min + 10 min transfer time)
├── Section 1: Social context, 2 speakers (10 questions)
│   └── Groups: Form/note completion, MCQ, matching
├── Section 2: Social context, monologue (10 questions)
│   └── Groups: MCQ, labelling, matching
├── Section 3: Academic context, 2-4 speakers (10 questions)
│   └── Groups: MCQ, sentence completion, matching
└── Section 4: Academic lecture, monologue (10 questions)
    └── Groups: Summary completion, sentence completion, MCQ
Total: 40 questions
```

### IELTS Academic — Reading
```
Test (60 min)
├── Passage 1: Easier text (~13 questions)
│   └── Groups: TFNG, fill-blank, MCQ, matching headings
├── Passage 2: Medium text (~13 questions)
│   └── Groups: YNNG, sentence completion, matching info
└── Passage 3: Harder text (~14 questions)
    └── Groups: MCQ, summary completion, matching
Total: 40 questions
```

### IELTS General — Reading
```
Test (60 min)
├── Section 1: Short factual texts (~14 questions)
├── Section 2: Work-related texts (~13 questions)
└── Section 3: Long complex text (~13 questions)
Total: 40 questions
```

### TOEIC Listening & Reading
```
Test (120 min)
├── Listening (45 min, 100 questions)
│   ├── Part 1: Photographs (6 questions) — MCQ from audio
│   ├── Part 2: Question-Response (25 questions) — MCQ from audio
│   ├── Part 3: Conversations (39 questions) — MCQ with transcript
│   └── Part 4: Talks (30 questions) — MCQ with transcript
└── Reading (75 min, 100 questions)
    ├── Part 5: Incomplete Sentences (30 questions) — MCQ
    ├── Part 6: Text Completion (16 questions) — MCQ with passage
    └── Part 7: Reading Comprehension (54 questions) — MCQ with passages
Total: 200 questions
```

### TOEIC Speaking & Writing
```
Test (~80 min)
├── Speaking (20 min)
│   ├── Q1-2: Read Aloud
│   ├── Q3: Describe a Picture
│   ├── Q4-6: Respond to Questions
│   ├── Q7-9: Respond using Provided Info
│   ├── Q10: Propose a Solution
│   └── Q11: Express an Opinion
└── Writing (60 min)
    ├── Q1-5: Write Sentences based on Pictures
    ├── Q6-7: Respond to Written Request
    └── Q8: Write an Opinion Essay
Total: 19 questions
```

---

## 3. New Data Structure

### Design Principles
1. **Exam-aware, not generic** — Structure knows about IELTS sections and TOEIC parts
2. **Typed question data** — Each question type has a validated schema, not raw JSON
3. **Granular CRUD** — Sections, groups, and questions are independently editable
4. **Templates built-in** — Creating a test pre-populates the standard structure

### 3.1 Updated Enums

```prisma
enum ExamType {
  IELTS_ACADEMIC
  IELTS_GENERAL
  TOEIC_LR        // Listening & Reading
  TOEIC_SW        // Speaking & Writing
}

enum SectionSkill {
  LISTENING
  READING
  WRITING
  SPEAKING
}

enum QuestionType {
  // Shared
  MULTIPLE_CHOICE         // A/B/C/D (or A/B/C for TOEIC)

  // IELTS-specific
  TRUE_FALSE_NOT_GIVEN
  YES_NO_NOT_GIVEN
  MATCHING_HEADINGS       // Match paragraphs to headings list
  MATCHING_INFORMATION    // Match statements to paragraphs
  MATCHING_FEATURES       // Match items to categories
  MATCHING_SENTENCE_ENDINGS
  SENTENCE_COMPLETION     // Complete sentence with words from text
  SUMMARY_COMPLETION      // Fill blanks in summary (word list or text)
  NOTE_COMPLETION         // Fill blanks in notes/table/flow-chart
  SHORT_ANSWER            // 1-3 word answer from text
  LABELLING               // Label a diagram/map/plan

  // TOEIC-specific (SW)
  READ_ALOUD
  DESCRIBE_PICTURE
  RESPOND_TO_QUESTIONS
  PROPOSE_SOLUTION
  EXPRESS_OPINION
  WRITE_SENTENCES
  RESPOND_WRITTEN_REQUEST
  WRITE_OPINION_ESSAY
}

enum AttemptStatus {
  IN_PROGRESS
  SUBMITTED
  ABANDONED
}
```

### 3.2 Updated Models

```prisma
// ─── Test ───────────────────────────────────────────────
model Test {
  id            String      @id @default(uuid())
  title         String
  examType      ExamType
  description   String?
  durationMins  Int
  isPublished   Boolean     @default(false)

  // Cached counters (updated by triggers/service)
  sectionCount  Int         @default(0)
  questionCount Int         @default(0)
  attemptCount  Int         @default(0)

  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  sections      TestSection[]
  tags          TestTag[]
  attempts      UserAttempt[]
  comments      Comment[]

  @@map("tests")
}

// ─── Section ────────────────────────────────────────────
model TestSection {
  id            String       @id @default(uuid())
  testId        String
  title         String       // e.g. "Section 1", "Part 5", "Passage 1"
  skill         SectionSkill
  orderIndex    Int
  instructions  String?      // Section-level instructions text
  audioUrl      String?      // For listening sections
  durationMins  Int?         // Optional per-section time limit

  test          Test         @relation(fields: [testId], references: [id], onDelete: Cascade)
  passages      Passage[]    // 0 or more reading passages
  questionGroups QuestionGroup[]
  attemptSections AttemptSection[]

  @@map("test_sections")
}

// ─── Passage (NEW) ──────────────────────────────────────
// Separates passage content from questions for cleaner rendering
model Passage {
  id            String       @id @default(uuid())
  sectionId     String
  title         String?      // e.g. "Reading Passage 1: The History of..."
  contentHtml   String       // The actual passage text
  orderIndex    Int

  section       TestSection  @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@map("passages")
}

// ─── Question Group ─────────────────────────────────────
// Groups questions that share a stimulus (instructions, audio clip, image)
model QuestionGroup {
  id            String       @id @default(uuid())
  sectionId     String
  questionType  QuestionType
  orderIndex    Int
  instructions  String?      // e.g. "Choose the correct letter A, B, C or D"
  audioUrl      String?      // Group-level audio (e.g. TOEIC Part 3 conversation)
  imageUrl      String?      // For labelling/describe picture questions

  // For matching-type questions: the list of options to match against
  // Stored as JSON array: ["A: Rivers", "B: Mountains", "C: Lakes"]
  matchingOptions Json?

  section       TestSection  @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  questions     Question[]

  @@map("question_groups")
}

// ─── Question ───────────────────────────────────────────
model Question {
  id              String    @id @default(uuid())
  groupId         String
  questionNumber  Int       // Global number within the test (1-40, 1-200)
  orderIndex      Int       // Order within the group
  stem            String?   // The question text (null for fill-in-blank)

  // MCQ options — typed JSON array: [{label: "A", text: "..."}, ...]
  options         Json?

  // Correct answer(s)
  // Single: "B" or "TRUE" or "river"
  // Multiple (matching): stored as JSON array ["A", "C", "B"]
  correctAnswer   String
  explanation     String?

  group           QuestionGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  answers         UserAnswer[]

  @@map("questions")
}
```

### 3.3 Key Changes from Current Schema

| Aspect | Before | After |
|--------|--------|-------|
| Passage storage | `TestSection.passageHtml` or `QuestionGroup.contentHtml` | Dedicated `Passage` model |
| Question content | `{n}` tokens in `contentHtml` | `Question.stem` + clear `questionNumber` |
| MCQ options | Untyped `Json` blob | Typed `[{label, text}]` array |
| Matching options | On `QuestionGroup.matchingOptions` as blob | Same field but with documented schema |
| Layout type | `LayoutType` enum | Removed — layout derived from section skill + content presence |
| Test format | `TestFormat` enum | Removed — unnecessary |
| Section instructions | Mixed in `passageHtml` | Dedicated `instructions` field |

---

## 4. Updated API Design

### Design Principles
1. **RESTful with granular endpoints** — CRUD at every level (test, section, group, question)
2. **Consistent response format** — `{ data, meta? }` wrapper
3. **Partial updates** — PATCH for individual fields, PUT for full replacement
4. **Exam-aware validation** — API enforces exam structure rules
5. **Template endpoints** — One-click test scaffolding

### 4.1 Test Endpoints

```
# List & Search
GET    /api/admin/tests?examType=&isPublished=&search=&page=&limit=

# CRUD
POST   /api/admin/tests                    # Create empty test (returns ID)
GET    /api/admin/tests/:id                # Full test tree
PATCH  /api/admin/tests/:id                # Update test metadata (title, duration, etc.)
DELETE /api/admin/tests/:id                # Delete with cascade

# Actions
POST   /api/admin/tests/:id/publish        # Publish
POST   /api/admin/tests/:id/unpublish      # Unpublish
POST   /api/admin/tests/:id/duplicate      # Deep clone → new draft test
POST   /api/admin/tests/:id/recount        # Recalculate cached counters

# Templates (NEW)
POST   /api/admin/tests/from-template      # Create pre-structured test
       Body: { examType: "IELTS_ACADEMIC", skill: "LISTENING" }
       → Creates test with 4 sections, empty groups, correct question numbers
```

### 4.2 Section Endpoints (NEW — granular)

```
POST   /api/admin/tests/:testId/sections              # Add section
GET    /api/admin/tests/:testId/sections/:id           # Get section with groups & questions
PATCH  /api/admin/tests/:testId/sections/:id           # Update section metadata
DELETE /api/admin/tests/:testId/sections/:id           # Delete section + cascade
POST   /api/admin/tests/:testId/sections/reorder       # Reorder sections
       Body: { order: ["uuid1", "uuid2", "uuid3"] }
```

### 4.3 Passage Endpoints (NEW)

```
POST   /api/admin/sections/:sectionId/passages         # Add passage
PATCH  /api/admin/passages/:id                          # Update passage
DELETE /api/admin/passages/:id                          # Delete passage
```

### 4.4 Question Group Endpoints (NEW — granular)

```
POST   /api/admin/sections/:sectionId/groups           # Add group
GET    /api/admin/groups/:id                            # Get group with questions
PATCH  /api/admin/groups/:id                            # Update group metadata
DELETE /api/admin/groups/:id                            # Delete group + cascade
POST   /api/admin/sections/:sectionId/groups/reorder    # Reorder groups
       Body: { order: ["uuid1", "uuid2"] }
```

### 4.5 Question Endpoints (NEW — granular)

```
POST   /api/admin/groups/:groupId/questions            # Add question(s)
       Body: { questions: [{ stem, options, correctAnswer }] }
PATCH  /api/admin/questions/:id                         # Update single question
DELETE /api/admin/questions/:id                          # Delete question
POST   /api/admin/groups/:groupId/questions/reorder     # Reorder questions
       Body: { order: ["uuid1", "uuid2", "uuid3"] }

# Bulk operations (NEW)
POST   /api/admin/questions/bulk-delete                 # Delete multiple
       Body: { questionIds: ["uuid1", "uuid2"] }
POST   /api/admin/tests/:testId/renumber                # Recalculate all questionNumbers
```

### 4.6 Question Bank (unchanged)

```
GET    /api/admin/questions?skill=&questionType=&examType=&search=&page=&limit=
```

### 4.7 Template Structures

When `POST /api/admin/tests/from-template` is called:

**IELTS Academic Listening:**
```json
{
  "title": "IELTS Academic Listening Test",
  "examType": "IELTS_ACADEMIC",
  "durationMins": 40,
  "sections": [
    { "title": "Section 1", "skill": "LISTENING", "instructions": "Questions 1-10" },
    { "title": "Section 2", "skill": "LISTENING", "instructions": "Questions 11-20" },
    { "title": "Section 3", "skill": "LISTENING", "instructions": "Questions 21-30" },
    { "title": "Section 4", "skill": "LISTENING", "instructions": "Questions 31-40" }
  ]
}
```

**IELTS Academic Reading:**
```json
{
  "title": "IELTS Academic Reading Test",
  "examType": "IELTS_ACADEMIC",
  "durationMins": 60,
  "sections": [
    { "title": "Passage 1", "skill": "READING", "passages": [{ "title": "", "contentHtml": "" }] },
    { "title": "Passage 2", "skill": "READING", "passages": [{ "title": "", "contentHtml": "" }] },
    { "title": "Passage 3", "skill": "READING", "passages": [{ "title": "", "contentHtml": "" }] }
  ]
}
```

**TOEIC LR:**
```json
{
  "title": "TOEIC Listening & Reading Test",
  "examType": "TOEIC_LR",
  "durationMins": 120,
  "sections": [
    { "title": "Part 1: Photographs", "skill": "LISTENING" },
    { "title": "Part 2: Question-Response", "skill": "LISTENING" },
    { "title": "Part 3: Conversations", "skill": "LISTENING" },
    { "title": "Part 4: Talks", "skill": "LISTENING" },
    { "title": "Part 5: Incomplete Sentences", "skill": "READING" },
    { "title": "Part 6: Text Completion", "skill": "READING" },
    { "title": "Part 7: Reading Comprehension", "skill": "READING" }
  ]
}
```

### 4.8 Validation Rules (Exam-Aware)

```
IELTS Listening:
  - Must have exactly 4 sections
  - Each section skill = LISTENING
  - Total questions should be 40
  - Must have audioUrl on test or sections

IELTS Reading:
  - Must have exactly 3 sections (Academic) or 3 sections (General)
  - Each section skill = READING
  - Each section must have at least 1 passage
  - Total questions should be 40

TOEIC LR:
  - Must have exactly 7 parts (4 Listening + 3 Reading)
  - Total questions should be 200
  - Parts 1-4: skill = LISTENING
  - Parts 5-7: skill = READING

TOEIC SW:
  - Must have Speaking + Writing sections
  - Total questions = 19
```

These are **warnings**, not hard errors — admin can save draft tests that don't meet the full structure yet.

---

## 5. UI/UX Improvements

### 5.1 New Test Creation Flow (Wizard)

Replace the current "create empty test + edit everything" with a **3-step wizard**:

```
Step 1: Choose Exam Type
┌──────────────────────────────────────────────┐
│  What type of test do you want to create?    │
│                                              │
│  ┌─────────────┐  ┌─────────────┐            │
│  │   IELTS     │  │   TOEIC     │            │
│  │  Academic   │  │  Listening  │            │
│  │             │  │  & Reading  │            │
│  └─────────────┘  └─────────────┘            │
│  ┌─────────────┐  ┌─────────────┐            │
│  │   IELTS     │  │   TOEIC     │            │
│  │  General    │  │  Speaking   │            │
│  │             │  │  & Writing  │            │
│  └─────────────┘  └─────────────┘            │
└──────────────────────────────────────────────┘

Step 2: Choose Skill (for IELTS only)
┌──────────────────────────────────────────────┐
│  Which skill?                                │
│                                              │
│  ┌──────────┐ ┌──────────┐                   │
│  │ Listening │ │ Reading  │                   │
│  └──────────┘ └──────────┘                   │
│  ┌──────────┐ ┌──────────┐                   │
│  │ Writing  │ │ Speaking │                   │
│  └──────────┘ └──────────┘                   │
└──────────────────────────────────────────────┘

Step 3: Confirm & Customize
┌──────────────────────────────────────────────┐
│  Test Details                                │
│                                              │
│  Title: [IELTS Academic Listening Test    ]  │
│  Duration: [40] minutes                      │
│  Tags: [IELTS] [Academic] [Listening]        │
│                                              │
│  Structure Preview:                          │
│  ✓ Section 1 (10 questions)                  │
│  ✓ Section 2 (10 questions)                  │
│  ✓ Section 3 (10 questions)                  │
│  ✓ Section 4 (10 questions)                  │
│                                              │
│  [Create Test]                               │
└──────────────────────────────────────────────┘
```

### 5.2 Redesigned Test Editor

Replace the current tree sidebar + form panel with a **section-tabbed editor**:

```
┌─ Test: IELTS Academic Listening Test ──────────────────────────┐
│ [Test Info] [Section 1] [Section 2] [Section 3] [Section 4]   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Section 1: Social Conversation                                │
│  Audio: [Upload audio] [current-file.mp3 ▶]                   │
│  Instructions: [Questions 1-10                              ]  │
│                                                                │
│  ┌─ Question Group 1 ─────────────────────────────────────┐   │
│  │ Type: [Form Completion ▼]                               │   │
│  │ Instructions: Complete the form below.                  │   │
│  │                                                         │   │
│  │  Q1. Name: [___] Answer: [Smith    ] Explain: [...]    │   │
│  │  Q2. Phone: [___] Answer: [555-0123 ] Explain: [...]   │   │
│  │  Q3. Date: [___] Answer: [15 March ] Explain: [...]    │   │
│  │                                                         │   │
│  │  [+ Add Question]                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ Question Group 2 ─────────────────────────────────────┐   │
│  │ Type: [Multiple Choice ▼]                               │   │
│  │ Instructions: Choose the correct letter A, B or C.      │   │
│  │                                                         │   │
│  │  Q4. What is the main purpose of the call?              │   │
│  │      A: [To make a booking  ]                           │   │
│  │      B: [To cancel a booking]  Correct: [A ▼]          │   │
│  │      C: [To change a booking]                           │   │
│  │                                                         │   │
│  │  [+ Add Question]                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  [+ Add Question Group]                                        │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ Questions: 10/10  │  [Preview] [Save Draft] [Publish]         │
└────────────────────────────────────────────────────────────────┘
```

### 5.3 Question Type Forms (Context-Aware)

Each question type renders a **specific form** instead of generic inputs:

**Multiple Choice (IELTS & TOEIC):**
```
Stem:    [What does the speaker suggest?          ]
Option A: [Visit the library    ]
Option B: [Ask the professor    ]  ← Correct ●
Option C: [Read the textbook    ]
Option D: [Search online        ]  (D optional for 3-option MCQ)
Explanation: [The speaker says "I'd recommend..."  ]
```

**True/False/Not Given:**
```
Statement: [The museum was opened in 1995.        ]
Answer:    ● True  ○ False  ○ Not Given
Explanation: [Paragraph 2 states "established in..." ]
```

**Matching Headings:**
```
Headings List:
  i.   [The impact on wildlife     ]
  ii.  [Economic considerations    ]
  iii. [Historical background      ]
  iv.  [Future prospects           ]  [+ Add heading]

Q14. Paragraph A → Answer: [iii ▼]
Q15. Paragraph B → Answer: [i   ▼]
Q16. Paragraph C → Answer: [ii  ▼]
[+ Add Question]
```

**Fill-in-Blank / Note Completion:**
```
Instructions: Complete the notes. Write NO MORE THAN TWO WORDS.
Q1. The course starts on [___]  Answer: [September 5  ]
Q2. Students need to bring [___] Answer: [notebook     ]
[+ Add Question]
```

### 5.4 Section Templates

When adding a section, offer **preset templates**:

```
Add Section:
┌────────────────────────────────────────┐
│ Choose a template:                     │
│                                        │
│ IELTS Listening:                       │
│   ● Section 1: Social (10q)           │
│   ○ Section 2: Social mono (10q)      │
│   ○ Section 3: Academic (10q)         │
│   ○ Section 4: Academic mono (10q)    │
│                                        │
│ IELTS Reading:                         │
│   ○ Passage with TFNG + MCQ           │
│   ○ Passage with Matching + Summary   │
│                                        │
│ TOEIC:                                 │
│   ○ Part 1: Photographs               │
│   ○ Part 3: Conversation set          │
│   ○ Part 7: Single passage            │
│   ○ Part 7: Double passage            │
│                                        │
│ ○ Blank section                        │
│                                        │
│ [Add Section]                          │
└────────────────────────────────────────┘
```

### 5.5 Test List Improvements

```
┌─ Tests ──────────────────────────────────────────────────────┐
│ [+ Create Test]                                               │
│                                                               │
│ Filters: [IELTS ▼] [Listening ▼] [Published ▼] [Search...] │
│                                                               │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📝 IELTS Academic Listening Test 1                       │ │
│ │ IELTS Academic · Listening · 40 questions · 40 min       │ │
│ │ 🟢 Published · 245 attempts · Created Mar 20, 2026      │ │
│ │                    [Duplicate] [Edit] [Unpublish] [Delete]│ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📝 TOEIC LR Full Test #3                                │ │
│ │ TOEIC LR · 200 questions · 120 min                      │ │
│ │ 🔴 Draft · 0 attempts · Created Mar 24, 2026            │ │
│ │                          [Duplicate] [Edit] [Publish]    │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 5.6 Validation & Feedback

The editor shows **real-time validation warnings** (not blocking):

```
⚠ Warnings:
  - Section 2 has 8 questions (expected 10 for IELTS Listening)
  - Question 15 is missing correct answer
  - No audio file uploaded for Section 1
  - Total questions: 38/40

✅ Ready to publish when:
  - All 40 questions have correct answers
  - Audio files are uploaded for all sections
```

### 5.7 Preview Mode

A **"Preview"** button opens a read-only student-view of the test:
- Shows passages, questions, and answer options exactly as students see them
- Audio player for listening sections
- Timer display
- No correct answers shown

---

## 6. Migration Approach

### Phase 1: Database Migration (Non-Breaking)

1. **Add `Passage` table** — new table, no existing data affected
2. **Migrate passage data** — move `TestSection.passageHtml` content into new `Passage` rows
3. **Add `instructions` field to `TestSection`** — nullable, no breaking change
4. **Remove deprecated columns** after data migration:
   - `TestSection.passageHtml` → migrated to `Passage.contentHtml`
   - `QuestionGroup.contentHtml` → split into `instructions` + passage references
5. **Remove unused enums**: `LayoutType`, `TestFormat` (if exists)
6. **Update `QuestionType` enum** — add new types, keep existing ones working

### Phase 2: API Migration (Backward Compatible)

1. **Add new granular endpoints** alongside existing ones
2. **Deprecate** `PUT /admin/tests/:id` (full replace) — log warnings
3. **Add template endpoint** `POST /admin/tests/from-template`
4. **Add duplicate endpoint** `POST /admin/tests/:id/duplicate`
5. **Add reorder endpoints** for sections, groups, questions
6. **Add validation endpoint** `GET /admin/tests/:id/validate` — returns warnings
7. **Update public test endpoints** to use new Passage model
8. **Remove deprecated endpoints** after frontend migration

### Phase 3: Frontend Migration

1. **Build new test creation wizard** (separate page from editor)
2. **Rebuild test editor** with section tabs + inline question forms
3. **Add question-type-specific form components**
4. **Add preview mode**
5. **Update test list** with new card layout + duplicate action
6. **Replace** old test editor route
7. **Update learner-facing pages** to render from new Passage model

### Migration Script (Data)

```sql
-- 1. Create passages from existing passageHtml
INSERT INTO passages (id, section_id, title, content_html, order_index)
SELECT
  gen_random_uuid(),
  ts.id,
  ts.title,
  ts.passage_html,
  0
FROM test_sections ts
WHERE ts.passage_html IS NOT NULL AND ts.passage_html != '';

-- 2. Move group contentHtml to instructions where applicable
UPDATE question_groups
SET instructions = content_html
WHERE content_html IS NOT NULL
  AND content_html NOT LIKE '%<p>%'; -- Simple text = instructions

-- 3. Content with HTML tags likely contains passage content
-- These need manual review or separate migration logic
```

---

## 7. Implementation Tasks

### Task 1: Database Schema Update
- Add `Passage` model
- Add `instructions` field to `TestSection`
- Update `QuestionType` enum with new types
- Remove `LayoutType` enum if present
- Create Prisma migration
- Write data migration script

### Task 2: Granular API Endpoints
- Section CRUD endpoints
- Passage CRUD endpoints
- Question Group CRUD endpoints
- Question CRUD endpoints (single + bulk)
- Reorder endpoints for each level
- Auto-renumber endpoint

### Task 3: Template & Utility Endpoints
- `POST /admin/tests/from-template` with all 4 exam type templates
- `POST /admin/tests/:id/duplicate` deep clone
- `GET /admin/tests/:id/validate` structure validation
- `POST /admin/tests/:id/recount` counter refresh

### Task 4: Test Creation Wizard UI
- Exam type selection (step 1)
- Skill selection for IELTS (step 2)
- Details + structure preview (step 3)
- Integration with template API

### Task 5: Redesigned Test Editor UI
- Section tab navigation
- Inline question group cards
- Question-type-specific form components:
  - MCQ form (3 or 4 options)
  - TFNG / YNNG radio form
  - Matching form (headings, info, features, sentence endings)
  - Fill-in-blank / completion form
  - Short answer form
  - Labelling form (with image upload)
- Audio upload per section/group
- Passage editor with TiptapEditor
- Real-time validation warnings panel
- Auto question numbering display
- Save draft / publish actions

### Task 6: Preview Mode
- Student-view renderer for test
- Passage rendering with proper typography
- Question rendering matching learner UI
- Audio player integration
- Read-only mode (no answer submission)

### Task 7: Test List & Dashboard Updates
- Card-style test list with skill badges
- Duplicate test action
- Filter by skill (not just exam type)
- Updated dashboard stats to reflect new structure

### Task 8: Learner-Side Updates
- Update test detail page to use Passage model
- Update attempt page to render passages from new model
- Ensure backward compatibility during migration

### Task 9: Data Migration & Cleanup
- Run migration script on existing data
- Verify all existing tests render correctly
- Remove deprecated columns/endpoints
- Update seed data to use new structure

---

## Appendix: Question Type → Exam Type Matrix

| Question Type | IELTS L | IELTS R | TOEIC LR | TOEIC SW |
|---------------|---------|---------|----------|----------|
| Multiple Choice | ✅ | ✅ | ✅ | |
| True/False/Not Given | | ✅ | | |
| Yes/No/Not Given | | ✅ | | |
| Matching Headings | | ✅ | | |
| Matching Information | | ✅ | | |
| Matching Features | ✅ | ✅ | | |
| Matching Sentence Endings | | ✅ | | |
| Sentence Completion | ✅ | ✅ | | |
| Summary Completion | ✅ | ✅ | | |
| Note Completion | ✅ | | | |
| Short Answer | ✅ | ✅ | | |
| Labelling | ✅ | | | |
| Read Aloud | | | | ✅ |
| Describe Picture | | | | ✅ |
| Respond to Questions | | | | ✅ |
| Propose Solution | | | | ✅ |
| Express Opinion | | | | ✅ |
| Write Sentences | | | | ✅ |
| Respond Written Request | | | | ✅ |
| Write Opinion Essay | | | | ✅ |

This matrix is enforced as a **validation warning** in the API — the admin can still save non-standard combinations for custom practice tests.
