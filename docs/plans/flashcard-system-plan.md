# Flashcard Learning System — Full Spec & Plan
# Flashcard Learning System — Full Spec & Plan

> Quizlet-style flashcard system for IELTS vocabulary learning with AI-powered question generation and spaced repetition.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js Frontend                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │  Deck    │ │  Study   │ │ Practice │ │   Review      │  │
│  │  CRUD    │ │  Mode    │ │  Mode    │ │   (Spaced)    │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬────────┘  │
│       │             │            │               │           │
│  ┌────┴─────────────┴────────────┴───────────────┴────────┐  │
│  │         React Query + Zustand (flashcard-store)        │  │
│  └────────────────────────┬───────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────┘
                            │ REST API (Axios)
┌───────────────────────────┼──────────────────────────────────┐
│                      NestJS Backend                          │
│  ┌──────────────────┐ ┌──────────────────┐                   │
│  │  FlashcardsModule │ │  AI Service      │                   │
│  │  - Controller     │ │  (OpenAI/Claude) │                   │
│  │  - Service        │ │  - Q Generation  │                   │
│  │  - SRS Service    │ │  - Distractors   │                   │
│  └────────┬──────────┘ └────────┬─────────┘                   │
│           │                     │                              │
│  ┌────────┴─────────────────────┴─────────┐                   │
│  │            Prisma ORM                   │                   │
│  └────────────────┬────────────────────────┘                   │
└───────────────────┼──────────────────────────────────────────┘
                    │
              ┌─────┴─────┐
              │ PostgreSQL │
              └───────────┘
```

**Modules:**
- `FlashcardsModule` — deck CRUD, card CRUD, study sessions, practice, test, review
- `AiGeneratorService` — injectable service for AI question generation (used by FlashcardsModule)
- Frontend: route group `(learner)/flashcards/...` with pages for browse, create, study, practice, test, review

---

## 2. Database Schema (Prisma)

### New Enums

```prisma
enum DeckVisibility {
  PUBLIC
  PRIVATE
}

enum FlashcardQuestionType {
  MULTIPLE_CHOICE
  TYPING
  FILL_IN_THE_BLANK
}

enum StudySessionType {
  STUDY        // flip card mode
  PRACTICE     // MCQ/typing/fill-in
  TEST         // scored quiz
  REVIEW       // spaced repetition
}
```

### New Models

```prisma
model Deck {
  id          String         @id @default(cuid())
  userId      String
  title       String
  description String?
  visibility  DeckVisibility @default(PRIVATE)
  cardCount   Int            @default(0)
  tags        String[]       @default([])    // e.g. ["IELTS", "band-7", "academic"]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  cards     Flashcard[]
  sessions  StudySession[]

  @@index([userId])
  @@index([visibility, updatedAt])
  @@map("decks")
}

model Flashcard {
  id              String   @id @default(cuid())
  deckId          String
  word            String
  meaning         String
  exampleSentence String?
  ipa             String?  // International Phonetic Alphabet
  audioUrl        String?
  imageUrl        String?
  orderIndex      Int
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  deck     Deck              @relation(fields: [deckId], references: [id], onDelete: Cascade)
  progress UserCardProgress[]

  @@unique([deckId, orderIndex])
  @@index([deckId])
  @@map("flashcards")
}

model UserCardProgress {
  id           String   @id @default(cuid())
  userId       String
  flashcardId  String
  // Familiarity (study mode): 0 = unknown, increases with "I know" clicks
  familiarity  Int      @default(0)
  // SM-2 spaced repetition fields
  easeFactor   Float    @default(2.5)
  interval     Int      @default(0)       // days until next review
  repetitions  Int      @default(0)
  nextReviewAt DateTime @default(now())
  lastReviewAt DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  flashcard Flashcard @relation(fields: [flashcardId], references: [id], onDelete: Cascade)

  @@unique([userId, flashcardId])
  @@index([userId, nextReviewAt])
  @@map("user_card_progress")
}

model StudySession {
  id            String           @id @default(cuid())
  userId        String
  deckId        String
  type          StudySessionType
  // Config
  questionCount Int?             // for TEST mode
  questionTypes FlashcardQuestionType[] @default([])  // for PRACTICE mode
  // Results
  totalCards    Int              @default(0)
  knownCount    Int              @default(0)   // STUDY: "I know" count
  correctCount  Int              @default(0)   // PRACTICE/TEST: correct answers
  scorePercent  Float?                          // TEST: final score
  startedAt     DateTime         @default(now())
  completedAt   DateTime?

  user    User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  deck    Deck                @relation(fields: [deckId], references: [id], onDelete: Cascade)
  answers StudySessionAnswer[]

  @@index([userId, deckId])
  @@index([userId, type])
  @@map("study_sessions")
}

model StudySessionAnswer {
  id          String                @id @default(cuid())
  sessionId   String
  flashcardId String
  questionType FlashcardQuestionType?
  // AI-generated question data (stored to avoid re-generation)
  question    String?               // the generated question text
  options     Json?                 // MCQ options array
  correctAnswer String?             // the correct answer
  explanation String?               // AI explanation
  // User response
  userAnswer  String?
  isCorrect   Boolean?
  answeredAt  DateTime?

  session   StudySession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@map("study_session_answers")
}
```

### User Model Updates

Add to existing `User` model:
```prisma
  decks           Deck[]
  cardProgress    UserCardProgress[]
  studySessions   StudySession[]
```

### ER Diagram (Key Relations)

```
User 1──N Deck 1──N Flashcard
User 1──N UserCardProgress N──1 Flashcard
User 1──N StudySession N──1 Deck
StudySession 1──N StudySessionAnswer
```

---

## 3. API Design

Base: `/api/flashcards`

### 3.1 Deck Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/decks` | Create deck | Yes |
| `GET` | `/decks` | List my decks + public decks | Yes |
| `GET` | `/decks/:id` | Get deck with cards | Yes |
| `PATCH` | `/decks/:id` | Update deck | Owner |
| `DELETE` | `/decks/:id` | Delete deck | Owner |
| `POST` | `/decks/:id/clone` | Clone public deck to my collection | Yes |

**Query params for `GET /decks`:**
- `page`, `limit` — pagination
- `search` — search by title
- `visibility` — `PUBLIC` | `PRIVATE` | `ALL` (default: `ALL` for own, `PUBLIC` for others)
- `tags` — comma-separated tag filter

**Create Deck body:**
```json
{
  "title": "IELTS Band 7 Vocabulary",
  "description": "Essential words for band 7+",
  "visibility": "PUBLIC",
  "tags": ["IELTS", "band-7"],
  "cards": [
    {
      "word": "ubiquitous",
      "meaning": "present, appearing, or found everywhere",
      "exampleSentence": "Mobile phones are now ubiquitous in modern society.",
      "ipa": "/juːˈbɪkwɪtəs/"
    }
  ]
}
```

### 3.2 Flashcard Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/decks/:deckId/cards` | Add cards to deck | Owner |
| `PATCH` | `/decks/:deckId/cards/:cardId` | Update a card | Owner |
| `DELETE` | `/decks/:deckId/cards/:cardId` | Delete a card | Owner |
| `POST` | `/decks/:deckId/cards/reorder` | Reorder cards | Owner |

### 3.3 Study Mode Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/decks/:deckId/study/start` | Start study session | Yes |
| `POST` | `/sessions/:sessionId/flip` | Record flip result (know/don't know) | Yes |
| `POST` | `/sessions/:sessionId/complete` | Complete study session | Yes |

**Flip body:**
```json
{
  "flashcardId": "abc123",
  "known": true
}
```

### 3.4 Practice Mode Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/decks/:deckId/practice/start` | Start practice session | Yes |
| `GET` | `/sessions/:sessionId/next-question` | Get next AI-generated question | Yes |
| `POST` | `/sessions/:sessionId/answer` | Submit answer | Yes |
| `POST` | `/sessions/:sessionId/complete` | Complete practice & get results | Yes |

**Start practice body:**
```json
{
  "questionTypes": ["MULTIPLE_CHOICE", "FILL_IN_THE_BLANK"],
  "questionCount": 10
}
```

**Next question response:**
```json
{
  "flashcardId": "abc123",
  "questionType": "MULTIPLE_CHOICE",
  "question": "Which word means 'present, appearing, or found everywhere'?",
  "options": ["ubiquitous", "ambiguous", "conspicuous", "contiguous"],
  "answerId": "answer123"
}
```

### 3.5 Test Mode Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/decks/:deckId/test/start` | Start test (generates all questions upfront) | Yes |
| `GET` | `/sessions/:sessionId/questions` | Get all test questions | Yes |
| `POST` | `/sessions/:sessionId/submit` | Submit all answers, get score | Yes |

**Start test body:**
```json
{
  "questionCount": 20,
  "questionTypes": ["MULTIPLE_CHOICE", "TYPING", "FILL_IN_THE_BLANK"]
}
```

**Submit response:**
```json
{
  "totalQuestions": 20,
  "correctCount": 16,
  "scorePercent": 80.0,
  "answers": [
    {
      "flashcardId": "abc123",
      "question": "...",
      "userAnswer": "ubiquitous",
      "correctAnswer": "ubiquitous",
      "isCorrect": true,
      "explanation": "..."
    }
  ]
}
```

### 3.6 Review (Spaced Repetition) Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/review/due` | Get all due cards across all decks | Yes |
| `GET` | `/review/due?deckId=x` | Get due cards for specific deck | Yes |
| `POST` | `/review/start` | Start review session with due cards | Yes |
| `POST` | `/review/:sessionId/rate` | Rate a card (0-5 SM-2 quality) | Yes |
| `GET` | `/review/stats` | Get review statistics | Yes |

**Rate body:**
```json
{
  "flashcardId": "abc123",
  "quality": 4
}
```
Quality scale (SM-2): 0=blackout, 1=incorrect, 2=incorrect but remembered, 3=correct with difficulty, 4=correct, 5=perfect

**Stats response:**
```json
{
  "totalCards": 150,
  "dueToday": 12,
  "learnedCards": 98,
  "masteredCards": 45,
  "streakDays": 7,
  "reviewsByDay": [
    { "date": "2026-03-27", "count": 15 },
    { "date": "2026-03-26", "count": 22 }
  ]
}
```

### 3.7 AI Generation Endpoint

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/ai/generate-questions` | Generate questions for given cards | Yes |

**Body:**
```json
{
  "cards": [
    { "word": "ubiquitous", "meaning": "present everywhere", "level": "band-7" }
  ],
  "questionType": "MULTIPLE_CHOICE",
  "count": 5
}
```

---

## 4. SM-2 Spaced Repetition Algorithm

```typescript
interface SM2Input {
  quality: number;      // 0-5
  repetitions: number;
  easeFactor: number;
  interval: number;     // days
}

interface SM2Output {
  repetitions: number;
  easeFactor: number;
  interval: number;
  nextReviewAt: Date;
}

function sm2(input: SM2Input): SM2Output {
  const { quality, repetitions, easeFactor, interval } = input;

  let newRepetitions: number;
  let newInterval: number;
  let newEaseFactor: number;

  if (quality < 3) {
    // Failed: reset
    newRepetitions = 0;
    newInterval = 1;
    newEaseFactor = easeFactor;
  } else {
    // Passed
    newRepetitions = repetitions + 1;
    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }
    // Update ease factor
    newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEaseFactor = Math.max(1.3, newEaseFactor);
  }

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

  return {
    repetitions: newRepetitions,
    easeFactor: newEaseFactor,
    interval: newInterval,
    nextReviewAt,
  };
}
```

---

## 5. AI Prompt Design

### System Prompt for Vocabulary Question Generation

```
You are an expert IELTS vocabulary question generator. Your task is to create high-quality English vocabulary questions for IELTS learners.

## Rules
1. All questions must be grammatically correct and use natural English.
2. For MCQ: generate exactly 4 options. Distractors must be plausible (same word class, similar difficulty level) but clearly wrong.
3. For FILL_IN_THE_BLANK: provide a sentence with exactly one blank (marked as ___). The blank must be the target word.
4. For TYPING: ask a definition-based or context-based question where the answer is the target word.
5. Explanations must be concise (1-2 sentences) and help the learner understand WHY the answer is correct.
6. Never use the target word in the question stem for MCQ (to avoid giving it away).
7. Example sentences should be at the appropriate IELTS band level.
8. Avoid cultural bias and offensive content.

## Input Format
You will receive a JSON array of vocabulary items:
{
  "cards": [
    {
      "word": "string",
      "meaning": "string",
      "level": "string (e.g. band-5, band-6, band-7, band-8)"
    }
  ],
  "questionType": "MULTIPLE_CHOICE | TYPING | FILL_IN_THE_BLANK",
  "count": number
}

## Output Format
Return ONLY a JSON array, no markdown, no explanation outside the JSON:
[
  {
    "word": "the target word",
    "questionType": "MULTIPLE_CHOICE",
    "question": "the question text",
    "options": ["option1", "option2", "option3", "option4"],
    "correctAnswer": "the correct option (must match exactly one option)",
    "explanation": "Brief explanation of why this is correct"
  }
]

For TYPING type:
- "options" should be null
- "correctAnswer" is the target word
- "question" should prompt the user to type the word

For FILL_IN_THE_BLANK type:
- "options" should be null
- "correctAnswer" is the target word
- "question" should contain ___ where the word goes

## Quality Checklist
- Is the question unambiguous? (only ONE correct answer possible)
- Are distractors plausible but clearly wrong?
- Is the language natural and at the right level?
- Does the explanation teach something useful?
```

### Example AI Call (Service Layer)

```typescript
async generateQuestions(
  cards: { word: string; meaning: string; level?: string }[],
  questionType: FlashcardQuestionType,
  count: number,
): Promise<GeneratedQuestion[]> {
  const response = await this.aiClient.chat({
    model: 'claude-sonnet-4-6',
    system: VOCABULARY_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        cards,
        questionType,
        count,
      }),
    }],
    temperature: 0.7,
    max_tokens: 4000,
  });

  // Parse and validate JSON response
  const questions = JSON.parse(response.content);
  return this.validateQuestions(questions, questionType);
}
```

---

## 6. Frontend Routes & Pages

```
/(learner)/flashcards                     → Browse/My Decks page
/(learner)/flashcards/create              → Create new deck
/(learner)/flashcards/[deckId]            → Deck detail (card list)
/(learner)/flashcards/[deckId]/edit       → Edit deck & cards
/(learner)/flashcards/[deckId]/study      → Study mode (flip cards)
/(learner)/flashcards/[deckId]/practice   → Practice mode (MCQ/typing/fill)
/(learner)/flashcards/[deckId]/test       → Test mode (scored quiz)
/(learner)/flashcards/review              → Review due cards (all decks)
```

### Key UI Components

```
components/flashcards/
  ├── deck-card.tsx              # Deck preview card for browse grid
  ├── deck-form.tsx              # Create/edit deck form
  ├── flashcard-form.tsx         # Add/edit individual card
  ├── flashcard-flip.tsx         # Flip card animation component
  ├── study-progress-bar.tsx     # Progress bar for study/practice
  ├── question-mcq.tsx           # Multiple choice question UI
  ├── question-typing.tsx        # Typing answer input UI
  ├── question-fill-blank.tsx    # Fill in the blank UI
  ├── test-results.tsx           # Score display + answer review
  ├── review-card.tsx            # Spaced repetition review card
  ├── review-stats.tsx           # Review statistics dashboard
  └── srs-calendar.tsx           # Review streak/calendar widget
```

### Zustand Store

```typescript
// lib/flashcard-store.ts
interface FlashcardStore {
  // Study mode state
  currentCardIndex: number;
  isFlipped: boolean;
  knownCards: Set<string>;
  unknownCards: Set<string>;

  // Practice/Test mode state
  currentQuestion: GeneratedQuestion | null;
  answers: Map<string, string>;

  // Actions
  flipCard: () => void;
  markKnown: (cardId: string) => void;
  markUnknown: (cardId: string) => void;
  nextCard: () => void;
  prevCard: () => void;
  submitAnswer: (cardId: string, answer: string) => void;
  reset: () => void;
}
```

---

## 7. Implementation Plan

### Phase 1: Core Schema + Deck CRUD (Backend)
**Estimated tasks: 5**

| # | Task | Output |
|---|------|--------|
| 1.1 | Add enums and models to `schema.prisma` | Migration file |
| 1.2 | Run migration, verify tables created | DB tables exist |
| 1.3 | Create `FlashcardsModule` with `flashcards.module.ts`, `flashcards.controller.ts`, `flashcards.service.ts` | Module scaffold |
| 1.4 | Implement Deck CRUD endpoints (create, list, get, update, delete) | Working REST API |
| 1.5 | Implement Card CRUD endpoints (add, update, delete, reorder) | Working REST API |

**Acceptance:**
- `POST /api/flashcards/decks` creates deck with cards
- `GET /api/flashcards/decks` returns paginated list (my decks + public)
- `GET /api/flashcards/decks/:id` returns deck with all cards
- `PATCH /api/flashcards/decks/:id` updates deck (owner only)
- `DELETE /api/flashcards/decks/:id` deletes deck (owner only)
- Card CRUD works within a deck
- Clone endpoint duplicates a public deck for current user

### Phase 2: Frontend — Deck Management
**Estimated tasks: 5**

| # | Task | Output |
|---|------|--------|
| 2.1 | Create browse page `/flashcards` with deck grid, search, filters | Deck listing UI |
| 2.2 | Create deck form page `/flashcards/create` | Create deck UI |
| 2.3 | Create deck detail page `/flashcards/[deckId]` | Card list view |
| 2.4 | Create edit page `/flashcards/[deckId]/edit` | Edit deck/cards UI |
| 2.5 | Wire up React Query hooks for all deck/card API calls | Data layer |

**Acceptance:**
- User can browse public decks and own decks
- User can create deck with inline card editor (add/remove/reorder cards)
- User can edit/delete own decks
- User can clone public decks

### Phase 3: Study Mode (Flip Cards)
**Estimated tasks: 4**

| # | Task | Output |
|---|------|--------|
| 3.1 | Backend: study session start/flip/complete endpoints | API endpoints |
| 3.2 | Backend: update familiarity in UserCardProgress on flip | Progress tracking |
| 3.3 | Frontend: flip card component with CSS 3D animation | Flip card UI |
| 3.4 | Frontend: study mode page with progress bar, know/don't know buttons, completion summary | Full study page |

**Acceptance:**
- Cards show word side first, flip to reveal meaning + example
- "I know" / "I don't know" buttons track familiarity
- Progress bar shows completion
- End screen shows summary (X known, Y unknown)
- Familiarity score persists per user per card

### Phase 4: Practice Mode (AI Questions)
**Estimated tasks: 5**

| # | Task | Output |
|---|------|--------|
| 4.1 | Backend: `AiGeneratorService` with system prompt | AI service |
| 4.2 | Backend: practice session start, next-question, answer, complete endpoints | API endpoints |
| 4.3 | Backend: question caching in StudySessionAnswer (avoid re-generation) | Cached questions |
| 4.4 | Frontend: MCQ, typing, fill-in-the-blank question components | Question UIs |
| 4.5 | Frontend: practice mode page with question flow, feedback, results | Full practice page |

**Acceptance:**
- User selects question types and count before starting
- AI generates contextual questions per card
- Immediate feedback on each answer (correct/incorrect + explanation)
- Results page at end with score breakdown
- Graceful fallback if AI generation fails (use basic definition-matching)

### Phase 5: Test Mode (Scored Quiz)
**Estimated tasks: 3**

| # | Task | Output |
|---|------|--------|
| 5.1 | Backend: test start (pre-generates all questions), questions endpoint, submit endpoint | API endpoints |
| 5.2 | Frontend: test mode page with question navigation, timer, submit | Test UI |
| 5.3 | Frontend: detailed results page with per-question review | Results UI |

**Acceptance:**
- All questions generated upfront and stored
- User can navigate between questions freely
- Submit returns scored results with explanations
- Score saved to StudySession

### Phase 6: Review Mode (Spaced Repetition)
**Estimated tasks: 4**

| # | Task | Output |
|---|------|--------|
| 6.1 | Backend: SM-2 algorithm implementation as `SrsService` | SM-2 service |
| 6.2 | Backend: review endpoints (due cards, start, rate, stats) | API endpoints |
| 6.3 | Frontend: review page showing due cards with rating buttons | Review UI |
| 6.4 | Frontend: review stats dashboard (streak, calendar, progress) | Stats UI |

**Acceptance:**
- Only due cards appear in review
- SM-2 algorithm correctly updates interval, easeFactor, nextReviewAt
- Rating 0-5 with descriptive labels
- Stats show total/due/learned/mastered counts
- Review history visualization

### Phase 7: Polish & Testing
**Estimated tasks: 3**

| # | Task | Output |
|---|------|--------|
| 7.1 | Add navigation links to learner layout (flashcards in navbar) | Navigation |
| 7.2 | Seed data: sample decks with IELTS vocabulary | Seed script |
| 7.3 | End-to-end manual testing of all flows | Bug fixes |

---

## 8. Testing Strategy

### 8.1 Unit Tests

**FlashcardsService:**
```
✓ createDeck — creates deck with cards, sets cardCount
✓ createDeck — rejects empty title
✓ findDecks — returns own decks + public decks, excludes other users' private
✓ findDecks — pagination works correctly
✓ findDecks — search filter works
✓ updateDeck — only owner can update
✓ updateDeck — returns 404 for non-existent deck
✓ deleteDeck — only owner can delete, cascades cards
✓ cloneDeck — duplicates all cards with new IDs, sets to PRIVATE
✓ cloneDeck — fails for private deck user doesn't own
✓ addCards — updates cardCount
✓ removeCard — updates cardCount and reorders remaining
✓ reorderCards — correctly updates orderIndex for all cards
```

**SrsService (SM-2):**
```
✓ quality=5 → increases interval and easeFactor
✓ quality=4 → increases interval, slight easeFactor change
✓ quality=3 → increases interval, easeFactor may decrease
✓ quality=2 → resets repetitions to 0, interval to 1
✓ quality=0 → resets repetitions to 0, interval to 1
✓ easeFactor never goes below 1.3
✓ first review: interval = 1 day
✓ second review: interval = 6 days
✓ subsequent reviews: interval = prev_interval * easeFactor
✓ nextReviewAt is correctly calculated from today + interval
```

**AiGeneratorService:**
```
✓ generates valid MCQ with 4 options
✓ generates valid typing question (no options)
✓ generates valid fill-in-the-blank with ___
✓ correctAnswer matches one of the options (MCQ)
✓ handles empty card list gracefully
✓ handles AI timeout with fallback questions
✓ validates JSON structure of AI response
✓ rejects response with ambiguous questions (multiple valid answers)
```

**StudySessionService:**
```
✓ startStudy — creates session with type STUDY
✓ recordFlip — updates familiarity (+1 for known, reset to 0 for unknown)
✓ completeStudy — calculates knownCount correctly
✓ startPractice — creates session, generates questions via AI
✓ submitAnswer — marks correct/incorrect, stores in StudySessionAnswer
✓ startTest — pre-generates all questions, stores in DB
✓ submitTest — scores all answers, returns scorePercent
✓ startReview — only fetches cards where nextReviewAt <= now
✓ rateCard — calls SM-2 and updates UserCardProgress
```

### 8.2 Integration Tests

```
✓ Full study flow: create deck → start study → flip all cards → complete
✓ Full practice flow: start practice → get question → answer → get next → complete
✓ Full test flow: start test → get all questions → submit all → get score
✓ Full review flow: study cards → wait → review due → rate → verify next review date
✓ Deck clone: user A creates public deck → user B clones → user B has own copy
✓ Auth: all endpoints reject unauthenticated requests
✓ Ownership: user B cannot edit/delete user A's deck
✓ Concurrent: two users studying same public deck simultaneously
```

### 8.3 Edge Cases

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| E1 | Empty deck — start study | Return error: "Deck has no cards" |
| E2 | Empty deck — start test | Return error: "Deck has no cards" |
| E3 | Deck with 1 card — start test with count=20 | Cap at 1, test has 1 question |
| E4 | AI generation fails (timeout/error) | Fall back to basic definition-matching questions |
| E5 | AI returns malformed JSON | Retry once, then fall back to basic questions |
| E6 | AI returns wrong number of questions | Pad with basic questions or trim |
| E7 | User submits duplicate answer for same card in session | Upsert: overwrite previous answer |
| E8 | User starts study but never completes | Session stays open; stale sessions cleaned up by cron (24h) |
| E9 | Deck owner deletes deck while another user is studying it | Session becomes orphaned; graceful "deck no longer available" error |
| E10 | SM-2 quality=0 for a card with interval=365 | Resets to interval=1 (full reset) |
| E11 | User has 0 due cards for review | Show "All caught up!" message |
| E12 | Very large deck (500+ cards) — start test | Limit question generation to max 50 per session |
| E13 | Card word contains special characters or Unicode | Handle correctly in AI prompt and DB |
| E14 | User clones own deck | Allow it (useful for creating variations) |
| E15 | Concurrent SM-2 updates to same card | Use optimistic locking or last-write-wins (acceptable for SRS) |
| E16 | AI generates a question where multiple options could be correct | Validation layer rejects; regenerate or fall back |
| E17 | Practice mode with all question types selected | Distribute evenly across types |
| E18 | Delete card that has UserCardProgress entries | Cascade delete progress (Prisma onDelete: Cascade) |
| E19 | User's timezone differs from server | Store all dates as UTC; client converts for display |
| E20 | Deck with duplicate words | Allow (user may want same word with different meanings/contexts) |

---

## 9. File Structure (New Files)

### Backend
```
apps/api/src/flashcards/
  ├── flashcards.module.ts
  ├── flashcards.controller.ts
  ├── flashcards.service.ts
  ├── srs.service.ts                 # SM-2 algorithm
  ├── ai-generator.service.ts        # AI question generation
  ├── dto/
  │   ├── create-deck.dto.ts
  │   ├── update-deck.dto.ts
  │   ├── create-card.dto.ts
  │   ├── update-card.dto.ts
  │   ├── start-session.dto.ts
  │   ├── submit-answer.dto.ts
  │   └── rate-card.dto.ts
  └── flashcards.constants.ts        # System prompt, config values
```

### Frontend
```
apps/web/src/
  ├── app/(learner)/flashcards/
  │   ├── page.tsx                    # Browse decks
  │   ├── create/page.tsx             # Create deck
  │   ├── review/page.tsx             # Review due cards
  │   └── [deckId]/
  │       ├── page.tsx                # Deck detail
  │       ├── edit/page.tsx           # Edit deck
  │       ├── study/page.tsx          # Study mode
  │       ├── practice/page.tsx       # Practice mode
  │       └── test/page.tsx           # Test mode
  ├── components/flashcards/
  │   ├── deck-card.tsx
  │   ├── deck-form.tsx
  │   ├── flashcard-form.tsx
  │   ├── flashcard-flip.tsx
  │   ├── study-progress-bar.tsx
  │   ├── question-mcq.tsx
  │   ├── question-typing.tsx
  │   ├── question-fill-blank.tsx
  │   ├── test-results.tsx
  │   ├── review-card.tsx
  │   ├── review-stats.tsx
  │   └── srs-calendar.tsx
  ├── features/flashcards/
  │   └── use-flashcard-queries.ts    # React Query hooks
  └── lib/
      └── flashcard-store.ts          # Zustand store
```

---

## 10. Dependencies to Add

### Backend
```json
{
  "@anthropic-ai/sdk": "^0.52.0"     // or openai SDK — for AI generation
}
```

### Frontend
No new dependencies needed — uses existing Ant Design, Tailwind, React Query, Zustand, Lucide.

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI latency (2-5s per question) | Bad UX during practice/test | Pre-generate questions at session start; show loading skeleton |
| AI cost per question | High API cost at scale | Cache generated questions in StudySessionAnswer; reuse for same card+type |
| AI hallucination (wrong answers) | Wrong learning material | Validation layer + fallback to deterministic questions |
| Large decks slow to load | UI freeze | Paginate cards in deck detail; virtual scroll for 100+ cards |
| SM-2 cold start (new cards) | No review data | Default values (easeFactor=2.5, interval=0) are standard SM-2 defaults |
