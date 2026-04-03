# System Restructure: IELTS + TOEIC Only

## 1. Current System Mindset — What's Wrong

The current system was designed as a **generic exam platform** that could theoretically support IELTS, TOEIC, HSK, TOPIK, JLPT, SAT, ACT, and THPTQG. This "support everything" approach created several problems:

**Overloaded ExamType enum (18 values, only 4 matter)**
The `ExamType` has 18 variants. For IELTS + TOEIC, you only need 4: `IELTS_ACADEMIC`, `IELTS_GENERAL`, `TOEIC_LR`, `TOEIC_SW`. The remaining 14 values add dead weight to every filter, every dropdown, every query.

**One-size-fits-all question model**
The `QuestionGroup` + `Question` structure was designed to handle any possible question format through a flexible `contentHtml` + `mcqOptions` + `matchingOptions` approach. This works, but it treats all exams the same. In reality, IELTS and TOEIC have very different content structures, and the generic model obscures those differences rather than making them clear.

**No exam-aware scoring**
The system stores `scorePercent` (a flat percentage) and `correctCount`. But:
- IELTS uses **band scores** (1.0–9.0 in 0.5 increments), derived from a raw-to-band conversion table that differs between Listening and Reading
- TOEIC uses **scaled scores** (5–495 per section, 10–990 total), also derived from a conversion table

A flat percentage doesn't represent either exam's scoring system meaningfully.

**No concept of exam structure**
Both IELTS and TOEIC have very specific, well-defined structures (IELTS Listening always has 4 sections with exactly 40 questions; TOEIC LR always has 7 parts with exactly 200 questions). The current system treats sections as arbitrary containers with no awareness of what each section represents in the context of the exam.

**Unnecessary LayoutType enum**
`PASSAGE_QUESTIONS`, `QUESTIONS_ONLY`, `AUDIO_QUESTIONS`, `AUDIO_VISUAL` — this tries to generalize what should be exam-specific rendering logic. IELTS Reading always shows a passage on the left and questions on the right. TOEIC Part 1 always shows a photograph with 4 audio choices. These aren't "layout types" — they're inherent to each exam part.

**Tags designed for a multi-exam world**
16 tags including `HSK`, `TOPIK`, `JLPT`, `SAT`, `ACT`, `THPTQG` — none of which will ever be used.

---

## 2. IELTS vs TOEIC — Core Structural Differences

### IELTS

**Structure:**
- 4 skills tested independently: Listening, Reading, Writing, Speaking
- Each skill has its own test session with its own time limit
- A "Full Test" is all 4 skills together; practice can be per-skill or per-section

**Listening (30 min + 10 min transfer time):**
- 4 sections (called "Sections" or "Parts"), each with 10 questions = 40 total
- Each section has its own audio recording
- Question types vary per section: form completion, MCQ, matching, map/diagram labeling, sentence completion, summary completion, table completion
- Audio plays once — the experience is linear and time-pressured

**Reading (60 min):**
- 3 passages, ~13-14 questions each = 40 total
- Academic vs General have different passage types (Academic = academic texts; General = everyday texts)
- Each passage has a reading text displayed alongside the questions
- Question types: True/False/Not Given, Yes/No/Not Given, matching headings, matching information, MCQ, sentence completion, summary completion, notes completion, table/flow-chart completion, short answer

**Writing (60 min):** (Phase 2 — AI graded)
- Task 1: describe a chart/graph (Academic) or write a letter (General)
- Task 2: essay (both variants)
- Graded on 4 criteria: Task Response, Coherence, Vocabulary, Grammar

**Speaking (11-14 min):** (Phase 4 — AI assisted)
- 3 parts: introduction, long turn (cue card), discussion

**Scoring:**
- Each skill: band 1.0–9.0 (0.5 increments)
- Overall band = average of 4 skills, rounded to nearest 0.5
- Raw score → band conversion uses official conversion tables (different for Listening vs Reading, and Academic vs General Reading)

### TOEIC

**Structure:**
- 2 separate tests: Listening & Reading (LR) and Speaking & Writing (SW)
- LR is the most common — almost always what people mean by "TOEIC"
- SW is less common and often taken separately

**TOEIC LR (120 min total):**

Listening (45 min, 100 questions):
- Part 1 — Photographs (6q): See a photo, hear 4 descriptions, pick the correct one
- Part 2 — Question-Response (25q): Hear a question, hear 3 responses, pick the best one
- Part 3 — Conversations (39q): Hear a conversation, answer 3 MCQ per conversation (13 sets × 3)
- Part 4 — Talks (30q): Hear a monologue, answer 3 MCQ per talk (10 sets × 3)

Reading (75 min, 100 questions):
- Part 5 — Incomplete Sentences (30q): Fill in the blank with the correct word/phrase (4 choices)
- Part 6 — Text Completion (16q): Read a passage, fill in 4 blanks per passage (4 sets × 4)
- Part 7 — Reading Comprehension (54q): Single passages, double passages, triple passages with MCQ

**Key insight:** TOEIC LR is almost entirely MCQ. The only "non-MCQ" aspect is Part 5/6 which are fill-in-the-blank but presented as 4-choice MCQ anyway.

**TOEIC SW:** (Phase 4)
- Speaking: 11 tasks (read aloud, describe photo, respond to questions, propose solution, express opinion)
- Writing: 8 tasks (write sentences, respond to request, write opinion essay)

**Scoring:**
- Listening: 5–495 (scaled)
- Reading: 5–495 (scaled)
- Total: 10–990
- Raw-to-scaled conversion uses ETS conversion tables

### Summary of Differences

| Aspect | IELTS | TOEIC LR |
|---|---|---|
| Total questions | 40 per skill | 200 (100L + 100R) |
| Time | 30/60/60/14 min per skill | 120 min total |
| Question types | Very diverse (8+ types) | Almost all MCQ |
| Content per section | Audio OR passage + varied questions | Audio OR passage + MCQ |
| Scoring | Band 1–9 per skill | 5–495 per section, 10–990 total |
| Variants | Academic / General | LR / SW |
| Section structure | Fixed (4L, 3R) | Fixed (Parts 1–7) |
| Passage display | Passage left, questions right (Reading) | Similar for Part 6/7 |

### What Can Be Shared

| Component | Shared? | Notes |
|---|---|---|
| User accounts & auth | Yes | Identical |
| Test entity (title, published, etc.) | Yes | With exam-specific fields |
| Section/Part container | Yes | But naming and structure differ |
| Question storage | Yes | MCQ model covers most of both exams |
| Attempt tracking | Yes | Start, save, submit flow is the same |
| Answer storage | Yes | Identical |
| Comments | Yes | Identical |
| Tags | Yes | But scoped to IELTS/TOEIC only |
| Auto-save mechanism | Yes | Identical |
| Timer logic | Yes | Identical |

### What Must Be Different

| Component | IELTS | TOEIC |
|---|---|---|
| Scoring | Band conversion table | Scaled score conversion table |
| Score display | Band 1–9 per skill + overall | 5–495 per section + total |
| Section naming | "Section 1" / "Passage 1" | "Part 1" / "Part 2" etc. |
| Question diversity | Need form/table/summary/matching/TFNG/YNNG/diagram | MCQ covers 95%+ |
| Reading layout | Always passage + questions side-by-side | Part 7 similar, Parts 5/6 are standalone |
| Audio behavior | 1 audio per section, plays once | Part 1–4 have audio, different per-question vs per-set |
| Practice granularity | Per skill, per section | Per part |

---

## 3. Proposed Simplified System Design

### Enums — Simplified

```
ExamType:      IELTS_ACADEMIC, IELTS_GENERAL, TOEIC_LR, TOEIC_SW

Skill:         LISTENING, READING, WRITING, SPEAKING

QuestionType:  MULTIPLE_CHOICE          — A/B/C/D or A/B/C (covers TOEIC almost entirely)
               TRUE_FALSE_NOT_GIVEN     — IELTS specific
               YES_NO_NOT_GIVEN         — IELTS specific
               MATCHING                 — Match items from two lists
               FILL_IN_BLANK            — Type the answer (form/note/table/summary completion)
               SENTENCE_COMPLETION      — Complete a sentence with words from the passage
               SHORT_ANSWER             — Write a short answer (1-3 words)

AttemptMode:   PRACTICE, FULL_TEST
AttemptStatus: IN_PROGRESS, SUBMITTED, ABANDONED
```

**What changed:**
- `ExamType`: 18 → 4 values
- `QuestionType`: Removed layout-specific types (`NOTE_FORM_COMPLETION`, `TABLE_COMPLETION`, `SUMMARY_COMPLETION`) and merged them into `FILL_IN_BLANK`. The visual layout (form, table, summary, note) is a rendering concern handled by `contentHtml` in the question group — it doesn't need to be a separate type. Added `TRUE_FALSE_NOT_GIVEN`, `YES_NO_NOT_GIVEN`, `SENTENCE_COMPLETION`, `SHORT_ANSWER` which are core IELTS types that were missing.
- Removed `TestFormat` (`FULL`/`CONDENSED`): A "condensed" test is just a test with fewer questions. No need for a separate enum — it can be a tag or just part of the title.
- Removed `LayoutType`: The layout is determined by the exam type + skill combination, not an enum. IELTS Reading → passage left + questions right. TOEIC Part 1 → photo + audio. This is frontend rendering logic, not data.

### Content Structure

```
Test
 └─ TestSection (1 per skill section / TOEIC part)
     └─ QuestionGroup (1 per shared stimulus block)
         └─ Question (1 per individual question number)
```

This hierarchy stays the same — it works well. The change is in **what each level means** for each exam:

**For IELTS Listening:**
```
Test: "IELTS Academic Listening Test 1"
 ├─ Section 1 (skill: LISTENING, audioUrl: "...", order: 1)
 │   ├─ Group 1 (type: FILL_IN_BLANK, contentHtml: "<form with {1}-{5}>")
 │   │   └─ Questions 1-5
 │   └─ Group 2 (type: MULTIPLE_CHOICE)
 │       └─ Questions 6-10
 ├─ Section 2 (skill: LISTENING, audioUrl: "...", order: 2)
 │   └─ ...Questions 11-20
 ├─ Section 3 (skill: LISTENING, audioUrl: "...", order: 3)
 │   └─ ...Questions 21-30
 └─ Section 4 (skill: LISTENING, audioUrl: "...", order: 4)
     └─ ...Questions 31-40
```

**For IELTS Reading:**
```
Test: "IELTS Academic Reading Test 1"
 ├─ Section 1 (skill: READING, passageHtml: "<article>...", order: 1)
 │   ├─ Group 1 (type: TRUE_FALSE_NOT_GIVEN)
 │   │   └─ Questions 1-5
 │   └─ Group 2 (type: MATCHING, matchingOptions: [...])
 │       └─ Questions 6-13
 ├─ Section 2 (skill: READING, passageHtml: "<article>...", order: 2)
 │   └─ ...Questions 14-26
 └─ Section 3 (skill: READING, passageHtml: "<article>...", order: 3)
     └─ ...Questions 27-40
```

**For TOEIC LR:**
```
Test: "TOEIC Listening & Reading Test 1"
 ├─ Part 1 (skill: LISTENING, order: 1)  — Photographs
 │   ├─ Group 1 (type: MCQ, contentHtml: null, imageUrl on question or group)
 │   │   └─ Question 1 (photo + 4 audio choices)
 │   ├─ Group 2 ...
 │   └─ ...Questions 1-6
 ├─ Part 2 (skill: LISTENING, order: 2)  — Question-Response
 │   └─ ...Questions 7-31 (MCQ, 3 choices, audio-only)
 ├─ Part 3 (skill: LISTENING, order: 3)  — Conversations
 │   ├─ Group 1 (contentHtml: optional transcript/context, audioUrl on group)
 │   │   └─ Questions 32-34 (3 MCQ per conversation)
 │   └─ ...Questions 32-70
 ├─ Part 4 (skill: LISTENING, order: 4)  — Talks
 │   └─ ...Questions 71-100
 ├─ Part 5 (skill: READING, order: 5)  — Incomplete Sentences
 │   └─ ...Questions 101-130 (standalone MCQ)
 ├─ Part 6 (skill: READING, order: 6)  — Text Completion
 │   ├─ Group 1 (contentHtml: "<passage with {101}-{104}>")
 │   │   └─ Questions 131-134 (MCQ fill-in)
 │   └─ ...Questions 131-146
 └─ Part 7 (skill: READING, order: 7)  — Reading Comprehension
     ├─ Group 1 (contentHtml: "<passage>")
     │   └─ Questions 147-149
     └─ ...Questions 147-200
```

### Scoring — Exam-Aware

Instead of just `scorePercent`, the attempt should store exam-specific scoring:

**On `UserAttempt`:**
- `correctCount` — raw correct answers (keep)
- `totalQuestions` — total questions (keep)
- `scorePercent` — remove or keep as a convenience field
- `bandScore` — IELTS only: overall band (e.g., 7.5). Null for TOEIC.
- `scaledScore` — TOEIC only: total scaled score (e.g., 785). Null for IELTS.
- `sectionScores` — JSON field storing per-section results:

For IELTS:
```json
{
  "listening": { "correct": 32, "total": 40, "band": 7.5 },
  "reading": { "correct": 35, "total": 40, "band": 8.0 }
}
```

For TOEIC:
```json
{
  "listening": { "correct": 85, "total": 100, "scaled": 420 },
  "reading": { "correct": 78, "total": 100, "scaled": 365 }
}
```

The band/scaled conversion logic lives in the backend service, using lookup tables:
- IELTS: raw score → band (official Cambridge conversion tables)
- TOEIC: raw score → scaled (ETS conversion tables)

### Tags — Simplified

Remove all non-IELTS/TOEIC tags. Keep only what's useful for filtering:

| Tag | Purpose |
|---|---|
| IELTS Academic | Exam variant |
| IELTS General | Exam variant |
| TOEIC LR | Exam variant |
| Listening | Skill filter |
| Reading | Skill filter |
| Writing | Skill filter |
| Speaking | Skill filter |
| Official Test | Source type |
| Practice | Source type |
| 2024 / 2025 | Year |
| Mini Test | For shorter practice sets |

---

## 4. What to Remove, Simplify, or Rethink

### Remove

| Item | Reason |
|---|---|
| 14 unused `ExamType` values | Dead code — HSK, TOPIK, JLPT, SAT, ACT, THPTQG will never be used |
| `TestFormat` enum | "Condensed" is not a format — it's just a shorter test. Use tags or title. |
| `LayoutType` enum | Frontend rendering concern, not data. Remove from schema. |
| Irrelevant tags in seed | HSK, TOPIK, JLPT, SAT, ACT, THPTQG tags |
| Placeholder routes for exams that won't exist | Any frontend scaffolding for non-IELTS/TOEIC |

### Simplify

| Item | Current | Proposed |
|---|---|---|
| `QuestionType` | 6 types, some are layout variants | 7 types, each represents a distinct answer mechanic |
| `TestSection.layoutType` | Enum on the section | Removed — determined by examType + skill at render time |
| `TestSection.passageHtml` | Field on section | Keep — it's the right place for reading passages |
| `TestSection.imageUrls` | JSON array on section | Move image to `QuestionGroup` level (TOEIC Part 1 photos are per-question-group) |
| Score storage | Just `scorePercent` | `bandScore` + `scaledScore` + `sectionScores` JSON |

### Rethink

**1. How "tests" are organized for each exam**

Currently, a "test" is one monolithic entity. But IELTS skills are often practiced independently (you take a "Listening test" or a "Reading test," not always a full 4-skill exam). Meanwhile, TOEIC LR is always taken as one combined test.

Recommendation: Keep `Test` as the top-level entity, but allow it to represent either:
- A single-skill IELTS test (e.g., "IELTS Academic Listening Test 1" — just Listening)
- A full IELTS test (all 4 skills — for Full Test mode)
- A TOEIC LR test (all 7 parts)

The `skill` field on `TestSection` already supports this. A test with only Listening sections is implicitly a Listening-only test.

**2. Audio handling**

IELTS: One audio file per section (recording). Audio plays for the entire section.
TOEIC: Audio varies per part — Part 1 has one short audio per question, Parts 3-4 have one audio per conversation/talk set.

Current approach of `audioUrl` on `TestSection` works for IELTS but not for TOEIC's per-group audio.

Recommendation: Allow `audioUrl` on **both** `TestSection` (for IELTS full-section audio) and `QuestionGroup` (for TOEIC per-set audio). The frontend checks group-level first, then falls back to section-level.

**3. Frontend rendering strategy**

Instead of a generic `LayoutType`, use a simple mapping:

```
IELTS + LISTENING → audio player top + questions below
IELTS + READING  → split view (passage left, questions right)
TOEIC + Part 1   → photo + audio + MCQ
TOEIC + Part 2   → audio-only + 3-choice MCQ
TOEIC + Part 3/4 → audio + optional context + MCQ set
TOEIC + Part 5   → standalone MCQ
TOEIC + Part 6   → passage with blanks + MCQ
TOEIC + Part 7   → passage + MCQ set
```

The frontend component tree branches on `examType` + `section.skill` + `section.orderIndex` (which identifies the TOEIC part number). No enum needed.

**4. Practice mode granularity**

- IELTS: Practice by skill (Listening only, Reading only) or by section (just Section 2 of Listening)
- TOEIC: Practice by part (just Part 5) or by skill group (all Listening parts, all Reading parts)

The current `AttemptSection` join table already supports this — users select which sections/parts to include. No change needed.

---

## 5. Summary of the Proposed System

### Core principles:
1. **Two exams, not N exams** — every design decision is made with IELTS and TOEIC in mind, not a hypothetical future exam
2. **Exam-aware scoring** — band scores for IELTS, scaled scores for TOEIC, with proper conversion tables
3. **Shared infrastructure, divergent presentation** — the data model is shared, but the frontend renders differently based on exam type
4. **Remove dead abstractions** — no LayoutType, no TestFormat, no 14 unused ExamType values
5. **Question types represent answer mechanics, not visual layout** — "fill in blank" is one type regardless of whether it's displayed as a form, table, or summary

### What stays the same:
- Test → Section → QuestionGroup → Question hierarchy
- Attempt → AttemptSection → UserAnswer tracking
- Auto-save and submit flow
- JWT auth, user roles
- Comments system
- Tags (but pruned)

### What changes:
- ExamType: 18 → 4
- QuestionType: layout-based → mechanic-based (add TFNG, YNNG, SHORT_ANSWER, SENTENCE_COMPLETION)
- Remove: TestFormat, LayoutType
- Add: bandScore, scaledScore, sectionScores on UserAttempt
- Add: audioUrl on QuestionGroup (for TOEIC per-set audio)
- Add: scoring conversion service (raw → band for IELTS, raw → scaled for TOEIC)
- Frontend: branch rendering on examType + skill, not on a layout enum

---

## 6. Implementation Status

### Backend — Completed
- [x] **Schema restructured** — ExamType (4 values), QuestionType (7 mechanic-based), removed TestFormat/LayoutType
- [x] **Migration applied** — `20260324200000_system_restructure`
- [x] **Scoring fields on UserAttempt** — bandScore, scaledScore, sectionScores (JSON)
- [x] **audioUrl/imageUrl on QuestionGroup** — for TOEIC per-set audio/photos
- [x] **ScoringService** — `src/scoring/scoring.service.ts`
  - IELTS Listening raw→band conversion (Cambridge tables)
  - IELTS Academic Reading raw→band conversion
  - IELTS General Reading raw→band conversion
  - TOEIC Listening raw→scaled conversion (ETS approximation, linear interpolation)
  - TOEIC Reading raw→scaled conversion
  - Overall band calculation (average + round to 0.5)
  - Total TOEIC score calculation
  - `calculateAttemptScores()` — unified entry point for any exam type
- [x] **ScoringModule** — registered and exported
- [x] **AttemptsService.submitAttempt** — now computes exam-specific scores (bandScore/scaledScore/sectionScores) using ScoringService
- [x] **Admin module fixed** — removed TestFormat/LayoutType references from controller, service, DTOs
- [x] **Tests module fixed** — removed TestFormat references from controller and service
- [x] **Seed data** — tags pruned to 12 (IELTS/TOEIC only), test data uses new enums
- [x] **Jest testing infrastructure** — jest.config.js, 39 tests passing
  - `scoring.service.spec.ts` — 34 tests (band conversion, scaled conversion, attempt scoring)
  - `attempts.service.spec.ts` — 5 tests (IELTS submit, TOEIC submit, error cases)
- [x] **Build passes** — `nest build` compiles clean

### Frontend — Pending
- [ ] Branch rendering on examType + skill (remove LayoutType dependency)
- [ ] Display band scores for IELTS results
- [ ] Display scaled scores for TOEIC results
- [ ] Section-level score breakdown on result page
