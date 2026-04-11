# TOEIC Speaking/Writing & HSK — Full Implementation Spec

> Date: 2026-04-06
> Status: Draft
> Covers: TOEIC Speaking (11Q), TOEIC Writing (8Q), credit gating, pronunciation evaluation system

---

## Table of Contents

1. [Test Structure](#1-test-structure)
2. [Architecture Overview](#2-architecture-overview)
3. [Credit System Integration](#3-credit-system-integration)
4. [Database & API Changes](#4-database--api-changes)
5. [Pronunciation Evaluation System (Anti-Auto-Correction)](#5-pronunciation-evaluation-system)
6. [Writing Grading Pipeline](#6-writing-grading-pipeline)
7. [Admin — Test Creation & Editor](#7-admin--test-creation--editor)
8. [Frontend — Learner Attempt UI](#8-frontend--learner-attempt-ui)
9. [Results Page](#9-results-page)
10. [Implementation Order](#10-implementation-order)
11. [Critical Files](#11-critical-files)
12. [Verification Plan](#12-verification-plan)

---

## 1. Test Structure

### TOEIC Speaking (11 questions)

| Tab | Questions | Type | Prompt | User Input | Prep/Response Time |
|-----|-----------|------|--------|------------|-------------------|
| Q1-2 | 2 | READ_ALOUD | Text passage displayed | Record audio | 45s prep, 45s record |
| Q3-4 | 2 | DESCRIBE_PICTURE | Image displayed | Record audio | 45s prep, 45s record |
| Q5-7 | 3 | RESPOND_TO_QUESTIONS | Scenario text + 3 sub-questions | Record audio (per question) | Q5: 15s, Q6: 15s, Q7: 30s |
| Q8-10 | 3 | PROPOSE_SOLUTION | Table/schedule/document + 3 questions | Record audio (per question) | 45s prep, 15-30s per answer |
| Q11 | 1 | EXPRESS_OPINION | Statement/prompt | Record audio | 30s prep, 60s record |

Each question has:
- A **notes/outline button** ("Viet ghi chu / dan y") for user scratch notes
- A red **Record button** ("THU AM") to capture audio

### TOEIC Writing (8 questions)

| Tab | Questions | Type | Prompt | User Input |
|-----|-----------|------|--------|------------|
| Q1-5 | 5 | WRITE_SENTENCES | Image + 2 keywords below image | Text area + word count |
| Q6-7 | 2 | RESPOND_WRITTEN_REQUEST | Email/letter displayed | Text area + word count |
| Q8 | 1 | WRITE_OPINION_ESSAY | Opinion prompt text | Text area + word count |

Each writing question has:
- A **notes button** ("Them ghi chu / dan y")
- A **text area** with placeholder "Viet essay tai day ..."
- A **word count** display below the text area

---

## 2. Architecture Overview

```
Admin creates TOEIC_SW test (template -> sections -> groups -> questions)
    |
User starts attempt -> credit check -> deduct -> navigates section tabs
    |
Speaking: User records audio -> PCM stream via WebSocket -> AWS Transcribe Streaming
         -> StableTokenTracker collects partials -> finalize -> score
Writing: User types text -> auto-save answerText -> submit
    |
Submit attempt -> grade:
  Speaking: Already graded during recording (stable tokens + alignment)
  Writing: AI grade text via Bedrock Claude (async)
    |
Create WritingEvaluation per answer -> show results
```

---

## 3. Credit System Integration

The platform already has a working credit system (`CreditsService` with `deduct`, `grant`, `hasSufficientCredits`).

### Credit Cost Table

| Action | Credit Cost | Reason Enum | When Deducted |
|--------|-------------|-------------|---------------|
| Start TOEIC_SW attempt | 10 | `TOEIC_SW_ATTEMPT` | On `startAttempt()` |
| Start HSK Writing attempt | 5 | `HSK_WRITING_ATTEMPT` | On `startAttempt()` |
| Speaking answer AI grading (per Q) | 3 | `AI_GRADING` | On `submitAttempt()` |
| Writing answer AI grading (per Q) | 2 | `AI_GRADING` | On `submitAttempt()` |

> Credit costs are per-attempt (not per-question for starting). AI grading costs accumulate per graded question on submission.

### Schema Changes

Add new `CreditReason` enum values:

```prisma
enum CreditReason {
  SIGNUP_BONUS
  DAILY_BONUS
  PRONUNCIATION_SESSION
  POLLY_TTS
  AI_GRADING
  ADMIN_TOPUP
  ADMIN_DEDUCT
  TOEIC_SW_ATTEMPT      // NEW
  HSK_WRITING_ATTEMPT    // NEW
}
```

### Enforcement Flow

**1. Pre-attempt credit check (frontend):**
- Before "Start Test" for TOEIC_SW or HSK tests with writing/speaking:
  - Fetch balance via `GET /credits/balance`
  - Show credit cost: "This test requires X credits"
  - If insufficient: disable "Start" button, show message with link to top-up
  - Reuse existing `CreditBadge` component

**2. Pre-attempt credit check (backend guard):**
- In `AttemptsService.startAttempt()`:
  - `TOEIC_SW`: require 10 credits
  - HSK with writing: require 5 credits
  - Throw `BadRequestException('Insufficient credits')` if not enough
  - Deduct immediately, log with `referenceId = attemptId`

**3. Grading credit deduction (backend):**
- In `submitAttempt()` grading pipeline:
  - Speaking: deduct 3 per answer (`AI_GRADING`)
  - Writing: deduct 2 per answer (`AI_GRADING`)
  - Non-blocking on failure (match existing pronunciation pattern)

**4. Frontend UX:**
- Test detail page: "Credits required: X" badge
- Test card in library: credit cost indicator for SW/writing tests
- Attempt page header: remaining balance
- After submission: "X credits used for grading" in result

### Existing Infrastructure to Reuse

| File | What to Reuse |
|------|---------------|
| `api/src/credits/credits.service.ts` | `deduct()`, `hasSufficientCredits()`, `getBalance()` |
| `api/src/credits/credits.controller.ts` | `GET /credits/balance`, `GET /credits/transactions` |
| `web/src/components/pronunciation/CreditBadge.tsx` | Credit balance display |
| `api/src/admin/admin-credits.controller.ts` | Admin credit management |

---

## 4. Database & API Changes

### 4.1 Schema Updates

**File:** `apps/api/prisma/schema.prisma`

```prisma
model UserAnswer {
  // ... existing fields
  answerText     String?
  audioAnswerUrl String?    // NEW: S3 URL for speaking answers
  // ...
}
```

### 4.2 New API Endpoints

**Learner audio upload:**
- `POST /attempts/:id/answers/:questionId/audio-presign` — presigned URL for audio upload
- Stores in `uploads/answers/{attemptId}/{questionId}.webm`
- Returns presigned URL + final S3 URL

**Updated endpoints:**
- `POST /attempts/:id/answers/bulk` — accept `audioAnswerUrl` alongside `answerText`
- `POST /attempts/:id/submit` — add speaking answer grading pipeline

---

## 5. Pronunciation Evaluation System

### 5.0 The Problem

AWS Transcribe auto-corrects user speech. "I eated food" becomes "I ate food." This breaks pronunciation and grammar evaluation.

**Solution:** Use **AWS Transcribe Streaming** (WebSocket) during recording, collect **partial results over time**, and build a "stable token" representation of what the user actually said — treating AWS output as raw signal, not ground truth.

### 5.1 System Architecture

```
+----------------------------------------------------------------+
|                        FRONTEND (Browser)                       |
|                                                                  |
|  MediaRecorder --> PCM chunks (16kHz mono)                       |
|       |                                                          |
|       +-->  WebSocket --> Backend Gateway                        |
|       |    (real-time audio stream)                              |
|       |                                                          |
|       +--> Blob --> S3 Upload (full recording backup)            |
|                                                                  |
|  <-- WebSocket <-- partial results, stable tokens, live feedback |
+----------------------------------------------------------------+
        |                           |
        v                           v
+-------------------+    +--------------------------------------+
|   S3 Bucket       |    |   Backend: SpeakingGateway (WS)      |
|   /answers/audio/ |    |                                      |
|   (backup .webm)  |    |   1. Receive PCM chunks from client  |
|                   |    |   2. Forward to AWS Transcribe Stream |
|                   |    |   3. Collect partial results          |
|                   |    |   4. Run StableTokenTracker           |
|                   |    |   5. On stop -> finalize + score      |
|                   |    |   6. Emit results back to client      |
+-------------------+    +----------+---------------------------+
                                    |
                         +----------v---------------------------+
                         |   AWS Transcribe Streaming (WebSocket)|
                         |                                       |
                         |   Emits:                              |
                         |   - Partial results (IsPartial=true)  |
                         |     -> words shift, change, disappear |
                         |   - Final results (IsPartial=false)   |
                         |     -> auto-corrected, "clean" text   |
                         |                                       |
                         |   We use BOTH but trust partials more |
                         +---------------------------------------+
                                    |
                         +----------v---------------------------+
                         |   Scoring Engine (post-recording)     |
                         |                                       |
                         |   1. Build spoken sentence from       |
                         |      stable tokens                    |
                         |   2. Align with target sentence       |
                         |      (LCS / Levenshtein)              |
                         |   3. Score each word                  |
                         |   4. Detect fluency (timing gaps)     |
                         |   5. Detect auto-corrections          |
                         |   6. Generate final assessment        |
                         +---------------------------------------+
```

### 5.2 Data Structures

```typescript
/** A single word item from AWS Transcribe partial/final result */
interface TranscribeWord {
  content: string;
  startTime: number;     // seconds
  endTime: number;       // seconds
  confidence: number;    // 0.0 - 1.0 (only in final results)
  type: 'pronunciation' | 'punctuation';
}

/** A snapshot of one partial result from Transcribe */
interface PartialSnapshot {
  resultId: string;
  timestamp: number;          // wall-clock time when received
  isPartial: boolean;
  transcript: string;         // full text of this partial
  words: TranscribeWord[];    // word-level breakdown
  snapshotIndex: number;      // sequential counter
}

/** Tracks a single word's evolution across partial results */
interface TokenEvolution {
  token: string;                    // the word content
  positionIndex: number;            // position in the spoken sequence
  firstSeenAt: number;              // snapshotIndex when first appeared
  lastSeenAt: number;               // snapshotIndex when last seen
  stableSince: number | null;       // snapshotIndex when became stable
  isStable: boolean;                // appeared in N consecutive partials unchanged
  consecutiveCount: number;         // how many consecutive partials it appeared in
  confidence: number;               // from final result, or estimated from stability
  startTime: number;                // audio timestamp (seconds)
  endTime: number;                  // audio timestamp (seconds)
  variants: string[];               // all forms this position has taken
  wasAutoCorrected: boolean;        // true if final differs from stable partial
}

/** The stable token tracker's internal state */
interface TokenTrackerState {
  snapshots: PartialSnapshot[];     // all partial snapshots collected
  tokenGrid: TokenEvolution[][];    // [snapshotIndex][positionIndex]
  stableTokens: TokenEvolution[];   // finalized stable sequence
  finalTranscript: string | null;   // AWS final result (auto-corrected)
  spokenSentence: string;           // our reconstructed sentence
}

/** Per-word scoring result */
interface WordScore {
  word: string;               // what user actually said (from stable tokens)
  targetWord: string | null;  // expected word from target sentence (null = extra word)
  status: 'correct' | 'warning' | 'incorrect' | 'missing' | 'extra';
  confidence: number;         // 0.0 - 1.0
  startTime: number;
  endTime: number;
  pauseBefore: number;        // gap in seconds before this word
  wasAutoCorrected: boolean;  // Transcribe changed this word in final
  details: string;            // explanation
}

/** Final assessment output */
interface SpeakingAssessment {
  // Word-level
  wordScores: WordScore[];

  // Sentence-level
  pronunciationScore: number;   // 0-100: based on word match + confidence
  fluencyScore: number;         // 0-100: based on timing, pauses, hesitations
  completenessScore: number;    // 0-100: % of target words spoken
  overallScore: number;         // 0-100: weighted combination

  // Metadata
  spokenSentence: string;       // reconstructed from stable tokens
  targetSentence: string;       // the reference text
  finalTranscript: string;      // AWS auto-corrected version (for comparison)
  totalDuration: number;        // seconds
  pauseCount: number;           // pauses > 0.5s
  totalPauseTime: number;       // total seconds paused
  autoCorrectionCount: number;  // words where Transcribe corrected the user
}
```

### 5.3 Step-by-Step Processing Flow

**PHASE 1: Real-Time Collection (during recording)**

```
Step 1: Client starts MediaRecorder -> sends PCM audio chunks via WebSocket
Step 2: Backend opens AWS Transcribe Streaming session
Step 3: Backend pipes audio chunks to Transcribe
Step 4: For each Transcribe result received:

  IF result.IsPartial === true:
    -> Create PartialSnapshot
    -> Feed to StableTokenTracker.addPartial(snapshot)
    -> Emit partial transcript to client (for live display)

  IF result.IsPartial === false:
    -> Store as finalTranscript with word-level confidence
    -> Feed to StableTokenTracker.addFinal(result)
    -> Continue listening for more results

Step 5: Client stops recording -> close Transcribe stream
Step 6: Proceed to Phase 2
```

**PHASE 2: Stable Token Resolution (immediately after recording stops)**

```
Step 1: StableTokenTracker.finalize()
  -> Walk through all partial snapshots
  -> For each word position, determine the "stable" form
  -> Flag words that were auto-corrected (stable != final)

Step 2: Build spokenSentence from stable tokens
  -> Join stable tokens in order
  -> This represents what the user ACTUALLY said

Step 3: Compare spokenSentence vs finalTranscript
  -> Log divergences (these are auto-corrections)
```

**PHASE 3: Scoring (after stable tokens resolved)**

```
Step 1: Word Alignment
  -> Align spokenSentence words with targetSentence words
  -> Use LCS (Longest Common Subsequence) for alignment
  -> Mark: matched, substituted, inserted (extra), deleted (missing)

Step 2: Per-Word Scoring
  -> For each aligned pair:
     - correct: stable token matches target AND confidence > 0.7
     - warning: matches target BUT confidence < 0.5 (likely auto-corrected)
     - warning: stable token differs from final (auto-correction detected)
     - incorrect: stable token doesn't match target
     - missing: target word not found in spoken
     - extra: spoken word not in target

Step 3: Fluency Analysis
  -> Calculate gaps between consecutive words using startTime/endTime
  -> Pause = gap > 0.5 seconds
  -> Long pause = gap > 1.5 seconds
  -> Hesitation = repeated word or false start

Step 4: Aggregate Scores
  -> pronunciationScore = weighted average of word scores
  -> fluencyScore = f(pauseCount, totalPauseTime, duration, hesitations)
  -> completenessScore = matchedWords / targetWords * 100
  -> overallScore = 0.4 * pronunciation + 0.3 * fluency + 0.3 * completeness
```

### 5.4 Pseudocode: Stable Token Detection

```typescript
class StableTokenTracker {
  private snapshots: PartialSnapshot[] = [];
  private tokenHistory: Map<string, TokenEvolution> = new Map(); // key: "pos:word"
  private STABILITY_THRESHOLD = 3; // must appear in N consecutive partials

  addPartial(snapshot: PartialSnapshot): void {
    this.snapshots.push(snapshot);
    const idx = snapshot.snapshotIndex;

    for (let pos = 0; pos < snapshot.words.length; pos++) {
      const word = snapshot.words[pos];
      const key = `${pos}:${word.content.toLowerCase()}`;

      if (this.tokenHistory.has(key)) {
        // Same word at same position -- increment consecutive count
        const evolution = this.tokenHistory.get(key)!;
        evolution.lastSeenAt = idx;
        evolution.consecutiveCount++;
        evolution.startTime = word.startTime;
        evolution.endTime = word.endTime;

        if (evolution.consecutiveCount >= this.STABILITY_THRESHOLD && !evolution.isStable) {
          evolution.isStable = true;
          evolution.stableSince = idx;
        }
      } else {
        // New word at this position -- might be a correction in progress
        const prevAtPos = this.findLatestAtPosition(pos);
        const variants = prevAtPos ? [...prevAtPos.variants, word.content] : [word.content];

        this.tokenHistory.set(key, {
          token: word.content,
          positionIndex: pos,
          firstSeenAt: idx,
          lastSeenAt: idx,
          stableSince: null,
          isStable: false,
          consecutiveCount: 1,
          confidence: word.confidence || 0,
          startTime: word.startTime,
          endTime: word.endTime,
          variants,
          wasAutoCorrected: false,
        });
      }
    }
  }

  addFinal(result: PartialSnapshot): void {
    // Compare final words against stable tokens
    for (let pos = 0; pos < result.words.length; pos++) {
      const finalWord = result.words[pos].content.toLowerCase();
      const stableAtPos = this.getStableTokenAtPosition(pos);

      if (stableAtPos && stableAtPos.token.toLowerCase() !== finalWord) {
        // AUTO-CORRECTION DETECTED:
        // User said stableAtPos.token (appeared consistently in partials)
        // but Transcribe "corrected" it to finalWord
        stableAtPos.wasAutoCorrected = true;
        stableAtPos.variants.push(`[final:${finalWord}]`);
      }

      // Update confidence from final result (only final has reliable confidence)
      if (stableAtPos) {
        stableAtPos.confidence = result.words[pos].confidence;
      }
    }
  }

  finalize(): TokenEvolution[] {
    // Build final sequence: prefer stable tokens, fall back to last-seen partial
    const maxPosition = this.getMaxPosition();
    const result: TokenEvolution[] = [];

    for (let pos = 0; pos <= maxPosition; pos++) {
      const stable = this.getStableTokenAtPosition(pos);
      if (stable) {
        result.push(stable);
      } else {
        // No stable token -- use the most recent word at this position
        const latest = this.findLatestAtPosition(pos);
        if (latest) {
          latest.isStable = false;
          latest.confidence *= 0.7; // penalize confidence
          result.push(latest);
        }
      }
    }

    return result;
  }

  private getStableTokenAtPosition(pos: number): TokenEvolution | null {
    for (const [, evolution] of this.tokenHistory) {
      if (evolution.positionIndex === pos && evolution.isStable) {
        return evolution;
      }
    }
    return null;
  }

  private findLatestAtPosition(pos: number): TokenEvolution | null {
    let latest: TokenEvolution | null = null;
    for (const [, evolution] of this.tokenHistory) {
      if (evolution.positionIndex === pos) {
        if (!latest || evolution.lastSeenAt > latest.lastSeenAt) {
          latest = evolution;
        }
      }
    }
    return latest;
  }

  private getMaxPosition(): number {
    let max = 0;
    for (const [, evolution] of this.tokenHistory) {
      max = Math.max(max, evolution.positionIndex);
    }
    return max;
  }
}
```

### 5.5 Pseudocode: Word Alignment (LCS-based)

```typescript
interface AlignedPair {
  spoken: string | null;
  target: string | null;
  type: 'match' | 'missing' | 'extra';
}

function alignWords(spoken: string[], target: string[]): AlignedPair[] {
  const m = spoken.length, n = target.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (normalizeWord(spoken[i-1]) === normalizeWord(target[j-1])) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }

  const aligned: AlignedPair[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && normalizeWord(spoken[i-1]) === normalizeWord(target[j-1])) {
      aligned.unshift({ spoken: spoken[i-1], target: target[j-1], type: 'match' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      aligned.unshift({ spoken: null, target: target[j-1], type: 'missing' });
      j--;
    } else {
      aligned.unshift({ spoken: spoken[i-1], target: null, type: 'extra' });
      i--;
    }
  }

  return aligned;
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}
```

### 5.6 Pseudocode: Scoring Engine

```typescript
function scoreWords(
  aligned: AlignedPair[],
  stableTokens: TokenEvolution[],
  targetSentence: string,
): SpeakingAssessment {

  const wordScores: WordScore[] = [];
  let correctCount = 0;
  let totalTargetWords = targetSentence.split(' ').length;

  for (const pair of aligned) {
    const token = stableTokens.find(t => t.token === pair.spoken);

    if (pair.type === 'match') {
      const confidence = token?.confidence ?? 0.5;
      const wasAutoCorrected = token?.wasAutoCorrected ?? false;

      if (wasAutoCorrected || confidence < 0.4) {
        // KEY DETECTION: Transcribe matched the target, but either:
        // - The partial results showed a different word (auto-corrected)
        // - Confidence is very low (Transcribe guessed)
        // -> User likely mispronounced this word
        wordScores.push({
          word: token?.token ?? pair.spoken!,
          targetWord: pair.target,
          status: 'warning',
          confidence,
          startTime: token?.startTime ?? 0,
          endTime: token?.endTime ?? 0,
          pauseBefore: 0,
          wasAutoCorrected,
          details: wasAutoCorrected
            ? `Auto-corrected: you said "${token?.variants[0]}" but Transcribe corrected to "${pair.target}"`
            : `Low confidence (${(confidence * 100).toFixed(0)}%) -- pronunciation may be unclear`,
        });
      } else {
        wordScores.push({
          word: pair.spoken!,
          targetWord: pair.target,
          status: 'correct',
          confidence,
          startTime: token?.startTime ?? 0,
          endTime: token?.endTime ?? 0,
          pauseBefore: 0,
          wasAutoCorrected: false,
          details: '',
        });
        correctCount++;
      }
    } else if (pair.type === 'missing') {
      wordScores.push({
        word: '',
        targetWord: pair.target,
        status: 'missing',
        confidence: 0,
        startTime: 0, endTime: 0, pauseBefore: 0,
        wasAutoCorrected: false,
        details: `Word "${pair.target}" was not spoken`,
      });
    } else if (pair.type === 'extra') {
      wordScores.push({
        word: pair.spoken!,
        targetWord: null,
        status: 'extra',
        confidence: token?.confidence ?? 0.3,
        startTime: token?.startTime ?? 0,
        endTime: token?.endTime ?? 0,
        pauseBefore: 0,
        wasAutoCorrected: false,
        details: `Extra word "${pair.spoken}" not in target`,
      });
    }
  }

  // Calculate pauses between consecutive spoken words
  const spokenWords = wordScores.filter(w => w.startTime > 0);
  for (let i = 1; i < spokenWords.length; i++) {
    spokenWords[i].pauseBefore = spokenWords[i].startTime - spokenWords[i - 1].endTime;
  }

  // Fluency scoring
  const pauses = spokenWords.filter(w => w.pauseBefore > 0.5);
  const longPauses = spokenWords.filter(w => w.pauseBefore > 1.5);
  const totalPauseTime = pauses.reduce((sum, w) => sum + w.pauseBefore, 0);
  const totalDuration = spokenWords.length > 0
    ? spokenWords[spokenWords.length - 1].endTime - spokenWords[0].startTime
    : 0;

  const pausePenalty = Math.min(pauses.length * 5, 30);
  const longPausePenalty = Math.min(longPauses.length * 10, 30);
  const fluencyScore = Math.max(0, 100 - pausePenalty - longPausePenalty);

  const pronunciationScore = wordScores.length > 0
    ? wordScores.reduce((sum, w) => {
        if (w.status === 'correct') return sum + 100;
        if (w.status === 'warning') return sum + 50;
        if (w.status === 'incorrect') return sum + 10;
        return sum;
      }, 0) / Math.max(totalTargetWords, 1)
    : 0;

  const completenessScore = (correctCount / totalTargetWords) * 100;

  return {
    wordScores,
    pronunciationScore: Math.round(pronunciationScore),
    fluencyScore: Math.round(fluencyScore),
    completenessScore: Math.round(completenessScore),
    overallScore: Math.round(
      0.4 * pronunciationScore + 0.3 * fluencyScore + 0.3 * completenessScore
    ),
    spokenSentence: stableTokens.map(t => t.token).join(' '),
    targetSentence,
    finalTranscript: '',
    totalDuration,
    pauseCount: pauses.length,
    totalPauseTime,
    autoCorrectionCount: stableTokens.filter(t => t.wasAutoCorrected).length,
  };
}
```

### 5.7 Auto-Correction Detection — Key Scenarios

| Scenario | Stable Token | Final Transcript | Confidence | Verdict |
|----------|-------------|------------------|------------|---------|
| User says "eated" | "eated" (stable 4x) | "ate" | 0.35 | **Auto-corrected.** Score as `warning`. User said "eated" |
| User says "beautiful" correctly | "beautiful" (stable 5x) | "beautiful" | 0.95 | **Correct.** High confidence, no correction |
| User mumbles "beau..." | "beau" (unstable, 1x) | "beautiful" | 0.40 | **Auto-corrected.** Incomplete word forced to "beautiful" |
| User says "go" for "went" | "go" (stable 3x) | "go" | 0.88 | **Incorrect** grammar, but no auto-correct. Caught by alignment |
| User says correct word softly | "the" (stable 3x) | "the" | 0.45 | **Warning.** Low confidence = unclear pronunciation |

### 5.8 Real-Time vs Post-Processing Trade-offs

| Aspect | Real-Time (during recording) | Post-Processing (after stop) |
|--------|------------------------------|------------------------------|
| Stable token tracking | **Real-time** — must track as partials arrive | N/A |
| Word alignment + scoring | N/A | **Post** — need complete spoken sentence |
| Fluency analysis | N/A | **Post** — need full timing data |
| Live feedback to user | **Real-time** — show live transcript from partials | N/A |
| Auto-correction detection | N/A | **Post** — compare stable vs final |

**Recommendation:**
- **During recording:** Only collect partials + run StableTokenTracker. Emit live transcript to frontend.
- **After stop:** Full scoring pipeline (finalize -> align -> score -> fluency). Takes < 500ms.
- **Frontend:** "Analyzing..." spinner < 1 second, then word-by-word colored results.

### 5.9 Integration with Question Types

| Question Type | Has Target? | Scoring Mode |
|---------------|-------------|--------------|
| READ_ALOUD | **Yes** (passage text) | Full stable-token + alignment + pronunciation scoring |
| DESCRIBE_PICTURE | **No** (open-ended) | Stable-token transcript -> Bedrock AI content grading |
| RESPOND_TO_QUESTIONS | **No** | Stable-token transcript -> Bedrock AI content grading |
| PROPOSE_SOLUTION | **No** | Stable-token transcript -> Bedrock AI content grading |
| EXPRESS_OPINION | **No** | Stable-token transcript -> Bedrock AI content grading |

**For READ_ALOUD:** Full pipeline (stable tokens + word alignment + per-word scoring).

**For open-ended:** Stable tokens build an accurate transcript, then Bedrock Claude grades:
- `grammarScore` (0-100), `vocabScore` (0-100), `contentScore` (0-100), `overallScore` (0-100)
- `feedback`: Detailed assessment + improvement tips

The AI grader receives BOTH stable transcript and auto-corrected final, plus auto-correction flags.

### 5.10 WebSocket Gateway Design

```typescript
// apps/api/src/toeic-sw-grading/speaking.gateway.ts
@WebSocketGateway({ namespace: '/speaking' })
export class SpeakingGateway {

  // Client events:
  // 'start-recording' -> { questionId, targetText?, attemptId }
  // 'audio-chunk'     -> binary PCM data
  // 'stop-recording'  -> {}

  // Server events:
  // 'partial'         -> { transcript: string, words: [...] }
  // 'started'         -> { creditsDeducted: number }
  // 'assessment'      -> SpeakingAssessment (full result)
  // 'error'           -> { message: string }

  async handleStartRecording(socket, payload) {
    // 1. Check credits
    // 2. Open AWS Transcribe Streaming session
    // 3. Initialize StableTokenTracker
    // 4. Start forwarding audio chunks
  }

  async handleAudioChunk(socket, chunk: Buffer) {
    // Forward to Transcribe stream
  }

  async handleStopRecording(socket) {
    // 1. Close Transcribe stream
    // 2. Wait for final result
    // 3. tracker.finalize() -> stable tokens
    // 4. If targetText: alignWords + scoreWords (READ_ALOUD)
    //    If no target: send stable transcript to Bedrock AI
    // 5. Save to UserAnswer (answerText + assessment JSON)
    // 6. Emit 'assessment' to client
  }
}
```

---

## 6. Writing Grading Pipeline

**Extend existing grading or new prompts in toeic-sw-grading service.**

### Grading criteria per question type:
- **WRITE_SENTENCES**: Grammar correctness, keyword usage, image relevance (simpler)
- **RESPOND_WRITTEN_REQUEST**: Format, content, grammar, vocabulary
- **WRITE_OPINION_ESSAY**: Organization, argument quality, grammar, vocabulary range

### TOEIC_SW Scoring
**File:** `apps/api/src/scoring/scoring.service.ts`

Add `calculateToeicSwScores()`:
- Speaking score: 0-200 (11 questions, weighted by type)
- Writing score: 0-200 (8 questions, weighted by type)
- Total: 0-400

---

## 7. Admin — Test Creation & Editor

### 7.1 Template Enhancement

**File:** `apps/api/src/admin/admin-tests.service.ts`

Section -> QuestionType mapping:

```
"Speaking: Read Aloud"           -> 1 group, READ_ALOUD, 2 questions
"Speaking: Describe a Picture"   -> 1 group, DESCRIBE_PICTURE, 2 questions
"Speaking: Respond to Questions" -> 1 group, RESPOND_TO_QUESTIONS, 3 questions
"Speaking: Propose a Solution"   -> 1 group, PROPOSE_SOLUTION, 3 questions
"Speaking: Express an Opinion"   -> 1 group, EXPRESS_OPINION, 1 question
"Writing: Write Sentences"       -> 1 group, WRITE_SENTENCES, 5 questions
"Writing: Respond to Request"    -> 1 group, RESPOND_WRITTEN_REQUEST, 2 questions
"Writing: Write an Opinion Essay"-> 1 group, WRITE_OPINION_ESSAY, 1 question
```

### 7.2 Admin Question Editor

**File:** `apps/web/src/app/(admin)/admin-tests/[id]/edit/page.tsx`

**Speaking questions:**
- **READ_ALOUD**: Text passage in `stem`. No correctAnswer (AI-graded).
- **DESCRIBE_PICTURE**: Upload image. stem = instructions.
- **RESPOND_TO_QUESTIONS**: Scenario in group `instructions`. Each question stem = specific question.
- **PROPOSE_SOLUTION**: Document/table in group instructions (Tiptap rich text). Each question stem = question.
- **EXPRESS_OPINION**: Opinion statement in `stem`.

**Writing questions:**
- **WRITE_SENTENCES**: Upload image + keywords in `metadata: { keywords: ["word1", "word2"] }`.
- **RESPOND_WRITTEN_REQUEST**: Email in `stem` (rich text). Metadata: `{ minWords: 50, maxWords: 120 }`.
- **WRITE_OPINION_ESSAY**: Prompt in `stem`. Metadata: `{ minWords: 300 }`.

**Default metadata per type:**

```typescript
// Speaking
READ_ALOUD:            { prepTime: 45, responseTime: 45 }
DESCRIBE_PICTURE:      { prepTime: 45, responseTime: 45 }
RESPOND_TO_QUESTIONS:  { prepTime: 0, responseTime: 15 }
PROPOSE_SOLUTION:      { prepTime: 45, responseTime: 60 }
EXPRESS_OPINION:       { prepTime: 30, responseTime: 60 }

// Writing
WRITE_SENTENCES:           { keywords: [], timeLimit: 90 }
RESPOND_WRITTEN_REQUEST:   { minWords: 50, maxWords: 120, timeLimit: 600 }
WRITE_OPINION_ESSAY:       { minWords: 300, timeLimit: 1800 }
```

### 7.3 Section Setup Guides

Add contextual guides for each TOEIC_SW section (like existing TOEIC_LR guides).

---

## 8. Frontend — Learner Attempt UI

### 8.1 Speaking Questions Layout

**New file:** `apps/web/src/components/attempt-layouts/speaking-layout.tsx`

```
+----------------------------------------------------------+
| [Tab: Q1-2] [Tab: Q3-4] [Tab: Q5-7] [Tab: Q8-10] [Q11] |
+--------------------------+-------------------------------+
|                          |                               |
|  Question prompt area    |  Question number badge (blue) |
|  - Text passage          |                               |
|  - OR Image              |  [Viet ghi chu / dan y]       |
|  - OR Scenario + Qs      |  (Notes button)               |
|  - OR Table/Document     |                               |
|                          |  [mic THU AM]                 |
|                          |  (Record button - red)        |
|                          |                               |
+--------------------------+-------------------------------+
|                                        TIEP THEO >       |
+----------------------------------------------------------+
```

### 8.2 Writing Questions Layout

**New file:** `apps/web/src/components/attempt-layouts/toeic-writing-layout.tsx`

```
+----------------------------------------------------------+
| [Tab: Q1-5] [Tab: Q6-7] [Tab: Q8]                       |
+--------------------------+-------------------------------+
|                          |                               |
|  Question prompt area    |  Question number badge (blue) |
|  - Image + keywords      |                               |
|  - OR Email content      |  [Them ghi chu / dan y]       |
|  - OR Essay prompt       |                               |
|                          |  +-------------------------+  |
|                          |  | Viet essay tai day ...  |  |
|                          |  |                         |  |
|                          |  +-------------------------+  |
|                          |  Word count: 0                |
|                          |                               |
+--------------------------+-------------------------------+
|                                        TIEP THEO >       |
+----------------------------------------------------------+
```

### 8.3 Question Renderers

**Speaking** (`components/question-renderers/toeic-speaking/`):

| Renderer | Displays | User Input |
|----------|----------|------------|
| `read-aloud-renderer.tsx` | Text passage | Audio recorder |
| `describe-picture-renderer.tsx` | Image | Audio recorder |
| `respond-questions-renderer.tsx` | Scenario + sub-questions | Audio recorder per Q |
| `propose-solution-renderer.tsx` | Document/table + questions | Audio recorder per Q |
| `express-opinion-renderer.tsx` | Opinion statement | Audio recorder |

**Writing** (`components/question-renderers/toeic-writing/`):

| Renderer | Displays | User Input |
|----------|----------|------------|
| `write-sentences-renderer.tsx` | Image + keywords | Text area + word count |
| `respond-request-renderer.tsx` | Email/letter | Text area + word count |
| `opinion-essay-renderer.tsx` | Essay prompt | Text area + word count |

### 8.4 Audio Recorder Component

**New file:** `apps/web/src/components/ui/audio-recorder.tsx`

Dual-purpose: streams PCM to backend via WebSocket (for Transcribe + stable tokens) AND records blob for S3 backup.

**Reuses** `apps/web/src/lib/pronunciation/use-microphone.ts` for PCM encoding (16kHz mono, int16).

**States:**

```
IDLE -> [THU AM] -> CONNECTING -> RECORDING -> [DUNG] -> ANALYZING -> SCORED
                                (live transcript)                        |
                                                               [play] / [re-record]
```

**WebSocket flow:**

```typescript
const socket = io('/speaking');
socket.emit('start-recording', { questionId, targetText, attemptId });
socket.emit('audio-chunk', pcmBuffer);     // stream chunks
socket.on('partial', ({ transcript }) => setLiveTranscript(transcript));
socket.emit('stop-recording');
socket.on('assessment', (result) => setResult(result));
```

### 8.5 Notes/Outline Component

**New file:** `apps/web/src/components/ui/scratch-notes.tsx`

- Toggle-able text area for private notes
- Local state only, not persisted to server
- Button: "Viet ghi chu / dan y" / "Them ghi chu / dan y"

### 8.6 Layout Router Update

**File:** `apps/web/src/components/attempt-layouts/layout-router.tsx`

```typescript
const TOEIC_SPEAKING_TYPES = [
  'READ_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_TO_QUESTIONS',
  'PROPOSE_SOLUTION', 'EXPRESS_OPINION'
];
const TOEIC_WRITING_TYPES = [
  'WRITE_SENTENCES', 'RESPOND_WRITTEN_REQUEST', 'WRITE_OPINION_ESSAY'
];
// Route to SpeakingQuestionsLayout or ToeicWritingLayout
```

### 8.7 Answer Submission Flow

**Speaking answers (real-time graded via WebSocket):**
1. Click "THU AM" -> WebSocket connects -> PCM streams to backend
2. Backend pipes to Transcribe Streaming -> StableTokenTracker collects partials
3. Live partial transcript displayed
4. Click "DUNG" -> finalize stable tokens -> scoring pipeline
5. READ_ALOUD: word alignment + per-word scoring (< 500ms)
6. Open-ended: stable transcript -> Bedrock Claude AI grading (async)
7. Audio blob uploaded to S3 as backup
8. Answer saved: `{ answerText: stableTranscript, audioAnswerUrl: s3Url }`

**Writing answers (graded on submit):**
1. Type in text area -> auto-save every 5s
2. On submit: Bedrock Claude AI grades text

**Post-submission:**

```
submitAttempt()
  +-- Speaking: Already graded during recording -> aggregate scores
  +-- Writing: Queue async AI grading per answer
  +-- Calculate TOEIC_SW scaled scores (Speaking 0-200, Writing 0-200)
  +-- Return attempt result
```

---

## 9. Results Page

### 9.1 WritingEvaluation Display

**File:** `apps/web/src/app/(learner)/tests/[id]/result/page.tsx`

For TOEIC_SW answers:
- Overall score badge (0-200 per skill)
- Per-question breakdown:
  - Speaking: Audio playback + transcript + word-by-word colored result + AI feedback
  - Writing: User's text + AI feedback with grammar highlights
- Score details: grammar, vocabulary, content scores
- Detailed feedback text
- Grammar errors list

### 9.2 Async Grading Polling

Writing results are async. Result page:
1. Show "Grading in progress..." for pending evaluations
2. Poll `GET /attempts/:id/writing-evaluations` every 5 seconds
3. Update UI as evaluations complete

Speaking results are already available (graded during recording).

---

## 10. Implementation Order

### Sprint 1: Core Infrastructure
1. Schema migration (`audioAnswerUrl` on UserAnswer, new `CreditReason` values)
2. Credit gate in `startAttempt()` — check & deduct for TOEIC_SW / HSK writing
3. Credit gate in `submitAttempt()` — per-question AI grading credits
4. Frontend credit display on test detail page (cost badge, balance check)
5. Learner audio presign endpoint
6. Audio recorder component (reusing pronunciation mic infrastructure)
7. Notes/scratch pad component

### Sprint 2: TOEIC Writing (text-only, simpler)
8. Writing question renderers (WRITE_SENTENCES, RESPOND_WRITTEN_REQUEST, WRITE_OPINION_ESSAY)
9. TOEIC writing layout with tabs
10. Layout router integration
11. TOEIC writing AI grading service + prompts
12. Admin editor enhancements for writing question types

### Sprint 3: TOEIC Speaking
13. StableTokenTracker class implementation
14. SpeakingGateway WebSocket (Transcribe Streaming integration)
15. Scoring engine (word alignment, per-word scoring, fluency)
16. Speaking question renderers (all 5 types)
17. Speaking layout with tabs + audio recorder integration
18. Admin editor for speaking question types

### Sprint 4: Results & Polish
19. Result page: WritingEvaluation display
20. Result page: Audio playback + word-by-word colored results for speaking
21. Async grading polling for writing
22. TOEIC_SW scoring (0-200 per skill)
23. Admin setup guides for TOEIC_SW sections

### Sprint 5: HSK Speaking (if needed)
24. HSK oral question types
25. HSK-specific speaking grading prompts
26. HSK oral template

---

## 11. Critical Files

### Backend

| File | Changes |
|------|---------|
| `api/prisma/schema.prisma` | `audioAnswerUrl` on UserAnswer, new CreditReason values |
| `api/src/attempts/attempts.service.ts` | Credit check on start, credit deduct on grading |
| `api/src/attempts/attempts.controller.ts` | Audio presign endpoint |
| `api/src/scoring/scoring.service.ts` | `calculateToeicSwScores()` |
| `api/src/admin/admin-tests.service.ts` | Refine TOEIC_SW template |
| **NEW** `api/src/toeic-sw-grading/` | Module: speaking gateway, stable token tracker, scoring engine, writing grading |

### Frontend

| File | Changes |
|------|---------|
| `web/src/components/attempt-layouts/layout-router.tsx` | Route TOEIC_SW types |
| **NEW** `web/src/components/attempt-layouts/speaking-layout.tsx` | Speaking test layout |
| **NEW** `web/src/components/attempt-layouts/toeic-writing-layout.tsx` | Writing test layout |
| **NEW** `web/src/components/question-renderers/toeic-speaking/` | 5 speaking renderers |
| **NEW** `web/src/components/question-renderers/toeic-writing/` | 3 writing renderers |
| **NEW** `web/src/components/ui/audio-recorder.tsx` | Audio recorder with WebSocket |
| **NEW** `web/src/components/ui/scratch-notes.tsx` | Notes component |
| `web/src/app/(learner)/tests/[id]/attempt/page.tsx` | Audio answer flow |
| `web/src/app/(learner)/tests/[id]/result/page.tsx` | WritingEvaluation display |
| `web/src/app/(admin)/admin-tests/[id]/edit/page.tsx` | TOEIC_SW question editors |

### Reusable Existing Code

| File | Reuse |
|------|-------|
| `web/src/lib/pronunciation/use-microphone.ts` | PCM encoding + chunking for WebSocket |
| `api/src/pronunciation/pronunciation.gateway.ts` | WebSocket + Transcribe Streaming pattern |
| `web/src/features/admin/hooks/use-upload.ts` | S3 presigned upload (audio blob backup) |
| `web/src/components/pronunciation/CreditBadge.tsx` | Credit balance display |
| `api/src/hsk-grading/hsk-grading.service.ts` | AI grading patterns (Bedrock + WritingEvaluation) |
| `api/src/upload/upload.service.ts` | S3 presign logic |
| `api/src/credits/credits.service.ts` | Credit deduction & balance check |
| `api/src/bedrock/bedrock.service.ts` | Bedrock Claude API wrapper |

---

## 12. Verification Plan

1. **Credit gating**: User with 0 credits -> "Start" disabled for TOEIC_SW -> admin tops up -> user can start -> credits deducted
2. **Credit deduction on grading**: Submit -> verify per-question credits deducted -> check transaction log
3. **Admin flow**: Create TOEIC_SW from template -> 8 sections with correct types -> add questions -> publish
4. **Speaking flow**: Start attempt -> navigate tabs -> record audio -> see live transcript -> stop -> see word-by-word results
5. **Stable token detection**: Say intentionally wrong word -> verify stable token captures it, not the auto-corrected version
6. **Writing flow**: Start attempt -> type in text areas -> verify word count -> auto-save -> submit -> verify AI grading
7. **Results**: Speaking results immediate, writing results appear via polling -> verify score display + feedback
8. **Scoring**: Verify TOEIC_SW scaled scores (Speaking 0-200, Writing 0-200, Total 0-400)
9. **Edge cases**: Close browser mid-test -> resume -> credits not double-charged. Insufficient credits mid-grading -> grading continues
