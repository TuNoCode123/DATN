# TOEIC Speaking & Writing Simulation - Technical Specification

## 1. Overview

### 1.1 Purpose
Add TOEIC Speaking & Writing (SW) test simulation to the Educatio platform, enabling learners to practice all 8 TOEIC SW question types with AI-powered grading and feedback.

### 1.2 Scope

**Phase 1 (this spec):**
- Writing section: fully functional with AI grading via AWS Bedrock
- Speaking section: real-time speech-to-text via microphone + AWS Transcribe Streaming
- Result page: displays AI evaluation scores and feedback
- Scoring: Speaking (0-200) + Writing (0-200) = Total (0-400)

**Phase 2 (future):**
- S3 audio storage for playback review on result page
- Pronunciation scoring via audio analysis
- Per-question countdown timers with auto-advance

### 1.3 TOEIC SW Test Structure

| Section | Questions | Type | Skill | Time (real test) |
|---------|-----------|------|-------|------------------|
| Writing Q1-5 | 5 | Write a sentence based on a picture | WRITING | 8 min total |
| Writing Q6-7 | 2 | Respond to a written request | WRITING | 10 min each |
| Writing Q8 | 1 | Write an opinion essay | WRITING | 30 min |
| Speaking Q1-2 | 2 | Read a text aloud | SPEAKING | 45 sec each |
| Speaking Q3-4 | 2 | Describe a picture | SPEAKING | 45 sec each |
| Speaking Q5-7 | 3 | Respond to questions | SPEAKING | 15-30 sec each |
| Speaking Q8-10 | 3 | Respond using information provided | SPEAKING | 15-30 sec each |
| Speaking Q11 | 1 | Express an opinion | SPEAKING | 60 sec |

**Total: 19 questions, 80 minutes**

---

## 2. Existing Infrastructure

### 2.1 What Already Exists

| Component | Status | Location |
|-----------|--------|----------|
| Prisma schema (all 8 question types) | Done | `api/prisma/schema.prisma` |
| ExamType.TOEIC_SW enum | Done | `api/prisma/schema.prisma:19-30` |
| SectionSkill.SPEAKING/WRITING | Done | `api/prisma/schema.prisma:32-37` |
| Admin test creation wizard (TOEIC_SW template) | Done | `web/src/app/(admin)/admin-tests/new/page.tsx` |
| Attempt lifecycle (start/save/submit/heartbeat) | Done | `api/src/attempts/attempts.service.ts` |
| Auto-save (5s interval) | Done | `web/src/app/(learner)/tests/[id]/attempt/page.tsx` |
| WritingEvaluation model | Done | `api/prisma/schema.prisma:326-344` |
| HSK AI grading pattern (Bedrock) | Done | `api/src/hsk-grading/hsk-grading.service.ts` |
| Audio playback component | Done | `web/src/components/ui/audio-player.tsx` |

### 2.2 QuestionType Enum Values (Prisma)

```
READ_ALOUD              // Speaking Q1-2
DESCRIBE_PICTURE        // Speaking Q3-4
RESPOND_TO_QUESTIONS    // Speaking Q5-7
PROPOSE_SOLUTION        // Speaking Q8-10 (mapped as info-based response)
EXPRESS_OPINION         // Speaking Q11
WRITE_SENTENCES         // Writing Q1-5
RESPOND_WRITTEN_REQUEST // Writing Q6-7
WRITE_OPINION_ESSAY     // Writing Q8
```

### 2.3 Key Interfaces (from `attempt-layouts/types.ts`)

```typescript
interface LayoutProps {
  section: SectionFromAPI;
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
  highlightEnabled?: boolean;
}

interface QuestionGroupFromAPI {
  id: string;
  questionType: string;       // e.g. 'WRITE_SENTENCES'
  orderIndex: number;
  instructions: string | null;
  matchingOptions: unknown;
  audioUrl?: string | null;
  imageUrl?: string | null;
  imageSize?: string | null;
  questions: QuestionFromAPI[];
}

interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  options: unknown;
  imageUrl?: string | null;
  audioUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}
```

### 2.4 WritingEvaluation Model

```prisma
model WritingEvaluation {
  id            String   @id @default(cuid())
  answerId      String   @unique
  examType      String           // "TOEIC_SW" for this feature
  hskLevel      Int?             // null for TOEIC
  grammarScore  Float            // 0-100
  vocabScore    Float            // 0-100
  contentScore  Float            // 0-100
  overallScore  Float            // 0-100 (weighted avg), -1 = failed
  feedback      String           // AI-generated feedback
  vocabAnalysis Json?            // Vocabulary analysis details
  grammarErrors Json?            // Grammar error breakdown
  modelUsed     String           // "bedrock:claude-3.5-haiku"
  createdAt     DateTime         @default(now())
  answer        UserAnswer       @relation(...)
}
```

---

## 3. Frontend Specification

### 3.1 File Structure

```
web/src/components/
  toeic-sw/
    WordCounter.tsx                              # NEW
    ToeicSwResultContent.tsx                     # NEW
  speaking/
    SpeakingRecorder.tsx                         # NEW - mic capture + real-time STT display
    useTranscribeSocket.ts                       # NEW - WebSocket hook for STT streaming
    AudioWaveform.tsx                            # NEW - live waveform visualization
  question-renderers/
    index.tsx                                    # MODIFY
    write-sentences-renderer.tsx                 # NEW
    respond-written-request-renderer.tsx         # NEW
    write-opinion-essay-renderer.tsx             # NEW
    speaking-question-renderer.tsx               # NEW
  attempt-layouts/
    layout-router.tsx                            # MODIFY
    toeic-sw-layout.tsx                          # NEW
web/src/app/(learner)/tests/[id]/
    result/page.tsx                              # MODIFY
```

### 3.2 WordCounter Component

**File:** `web/src/components/toeic-sw/WordCounter.tsx`

```typescript
interface WordCounterProps {
  text: string;
}

// Count English words: text.trim().split(/\s+/).filter(Boolean).length
// Display: "Word count: {n}"
// Style: text-sm text-slate-500 mt-1
```

### 3.3 Question Renderers

All renderers follow the same props interface (matching existing pattern):

```typescript
interface Question {
  id: string;
  questionNumber: number;
  stem: string | null;
  imageUrl?: string | null;
  audioUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface RendererProps {
  group: {
    instructions: string | null;
    questionType: string;
    imageUrl?: string | null;
  };
  questions: Question[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
}
```

#### 3.3.1 WriteSentencesRenderer (WRITE_SENTENCES, Writing Q1-5)

**File:** `web/src/components/question-renderers/write-sentences-renderer.tsx`

**Layout:** Two-column per question (responsive: stacked on mobile, side-by-side on md+)

```
+-----------------------------+-----------------------------+
| [Image]                     | [1] Question badge          |
|                             |                             |
| Keywords: read / newspaper  | +-------------------------+ |
|                             | | Textarea (rows=4)       | |
|                             | |                         | |
|                             | +-------------------------+ |
|                             | Word count: 12              |
+-----------------------------+-----------------------------+
```

**Data mapping:**
- Image: `question.imageUrl`
- Keywords: `question.stem` (displayed as highlighted text, e.g. "read / newspaper")
- Answer: `answers[question.id]` via textarea
- Word count: `<WordCounter text={answer} />`

**Behavior:**
- Each question has its own image + keyword pair + textarea
- Questions separated by `<hr>` dividers
- Textarea calls `onAnswer(question.id, e.target.value)` on change
- Placeholder: "Write a sentence based on the picture..."

#### 3.3.2 RespondWrittenRequestRenderer (RESPOND_WRITTEN_REQUEST, Writing Q6-7)

**File:** `web/src/components/question-renderers/respond-written-request-renderer.tsx`

**Layout:** Two-column per question

```
+-----------------------------+-----------------------------+
| Respond to an email         | [6] Question badge          |
|                             |                             |
| From: update@daily...       | +-------------------------+ |
| To: Anna Billings           | | Textarea (rows=8)       | |
| Subject: Daily Jobseeker    | |                         | |
| Sent: March 14, 20--        | |                         | |
|                             | |                         | |
| Dear Daily Jobseeker...     | +-------------------------+ |
|                             | Word count: 0               |
| [Directions in highlight]   |                             |
+-----------------------------+-----------------------------+
```

**Data mapping:**
- Email/letter content: `group.instructions` rendered via `<RichContent html={...} />`
- If `group.instructions` is null, fall back to `question.stem`
- Answer: textarea per question
- Directions (highlighted): Part of `group.instructions` HTML content

**Behavior:**
- Email content rendered with `RichContent` component (supports HTML)
- Directions text highlighted in yellow/amber background (matching reference screenshots)
- Larger textarea than Q1-5 (rows=8) since responses are longer

#### 3.3.3 WriteOpinionEssayRenderer (WRITE_OPINION_ESSAY, Writing Q8)

**File:** `web/src/components/question-renderers/write-opinion-essay-renderer.tsx`

**Layout:** Two-column, single question

```
+-----------------------------+-----------------------------+
| Essay prompt text           | [8] Question badge          |
|                             |                             |
| "Many people enjoy spending | +-------------------------+ |
|  time playing and watching  | | Textarea (rows=12)      | |
|  sports. Why do you think   | |                         | |
|  sports are important to    | |                         | |
|  people? Give specific      | |                         | |
|  reasons and examples to    | |                         | |
|  support your opinion."     | |                         | |
|                             | +-------------------------+ |
|                             | Word count: 0               |
+-----------------------------+-----------------------------+
```

**Data mapping:**
- Prompt: `question.stem` or `group.instructions`
- Answer: large textarea (rows=12)
- Prompt displayed with highlighted/emphasized styling (matching reference screenshots)

**Behavior:**
- Single question per group
- Larger textarea for essay writing (minimum 300 words suggested)
- Placeholder: "Write your essay here..."

#### 3.3.4 SpeakingQuestionRenderer (All 5 Speaking Types)

**File:** `web/src/components/question-renderers/speaking-question-renderer.tsx`

**Layout:** Two-column, varies by type. Right panel features real-time audio recording with live transcription.

```
+-----------------------------+-----------------------------+
| [Stimulus - varies by type] | [N] Question badge          |
|                             |                             |
|                             | +-------------------------+ |
|                             | | ~~~ Waveform ~~~        | |
|                             | +-------------------------+ |
|                             |                             |
|                             | [ REC ] Recording 00:12     |
|                             |                             |
|                             | +-------------------------+ |
|                             | | Live transcript:        | |
|                             | | "The man is reading a   | |
|                             | | newspaper while..."     | |
|                             | | [streaming cursor |]    | |
|                             | +-------------------------+ |
|                             | Word count: 8               |
+-----------------------------+-----------------------------+
```

**Left panel content by `group.questionType`:**

| Type | Left Panel Content |
|------|-------------------|
| `READ_ALOUD` | Text passage from `question.stem` in a bordered card |
| `DESCRIBE_PICTURE` | Image from `question.imageUrl` or `group.imageUrl` |
| `RESPOND_TO_QUESTIONS` | Scenario from `group.instructions` + individual questions from `question.stem` |
| `PROPOSE_SOLUTION` | Scenario/schedule from `group.instructions` + "What you'll hear" questions |
| `EXPRESS_OPINION` | Opinion prompt from `question.stem` in a bordered card |

**Right panel - SpeakingRecorder component (see Section 3.8):**
- Microphone permission request on first interaction
- Record button (red, toggleable): starts/stops recording
- Live waveform visualization while recording
- Real-time transcript display: text streams in ~2-3s after speech
- Editable transcript textarea: user can correct STT errors before submitting
- Word count below transcript
- Answer saved as final transcript text via `onAnswer(questionId, transcriptText)`

**Behavior:**
- For `RESPOND_TO_QUESTIONS` and `PROPOSE_SOLUTION`: multiple questions shown but ONE recorder per group
- Transcript auto-saves via the standard auto-save mechanism (every 5s)
- User can re-record (clears previous transcript)
- If mic permission denied: falls back to manual textarea input with warning banner

### 3.8 Speaking Recording & Real-Time STT Components

#### 3.8.1 SpeakingRecorder Component

**File:** `web/src/components/speaking/SpeakingRecorder.tsx`

The main recording UI component used by `SpeakingQuestionRenderer`.

```typescript
interface SpeakingRecorderProps {
  questionId: string;
  currentTranscript: string;        // from answers[questionId]
  onTranscriptChange: (text: string) => void;  // calls onAnswer
  attemptId: string;                 // for WebSocket session
}

// States: idle | requesting_permission | recording | processing | done | error
type RecordingState = 'idle' | 'requesting_permission' | 'recording' | 'processing' | 'done' | 'error';
```

**State machine:**
```
idle → [click Record] → requesting_permission
requesting_permission → [mic granted] → recording
requesting_permission → [mic denied] → error (show fallback textarea)
recording → [click Stop] → processing → done
recording → [real-time STT events] → update transcript display
done → [click Re-record] → idle
```

**UI Elements:**
```
+---------------------------------------------+
| +------- Waveform Visualization -----------+ |
| |  ~~~/\~~~\/~~~~/\~~~~~/\~~~~/\~~~         | |
| +------------------------------------------+ |
|                                               |
| [  REC  ]  Recording... 00:15                |
|   (red)     elapsed timer                     |
|                                               |
| +------- Live Transcript ------------------+ |
| | "Welcome everyone. Before we begin, in   | |
| | this twentieth discussion meeting, we    | |
| | will talk about..."                      | |
| |                              [cursor |]  | |
| +------------------------------------------+ |
| Word count: 18                                |
|                                               |
| [Edit transcript]  [Re-record]               |
+---------------------------------------------+
```

**Recording flow:**
1. User clicks "Record" button
2. Request `navigator.mediaDevices.getUserMedia({ audio: true })`
3. Create `MediaRecorder` with `mimeType: 'audio/webm;codecs=opus'`
4. Connect to `AnalyserNode` for waveform visualization
5. Send audio chunks to backend via WebSocket for STT
6. Display streaming transcript as it arrives
7. On stop: finalize transcript, call `onTranscriptChange(finalText)`

**Microphone permission handling:**
```typescript
// Check permission status
const permResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
// 'granted' | 'denied' | 'prompt'

// If denied: show warning + fallback to manual textarea
// If prompt: show friendly "Allow microphone access" dialog
```

#### 3.8.2 useTranscribeSocket Hook

**File:** `web/src/components/speaking/useTranscribeSocket.ts`

Custom React hook managing the WebSocket connection for real-time STT.

```typescript
interface UseTranscribeSocketOptions {
  attemptId: string;
  questionId: string;
  onPartialTranscript: (text: string) => void;   // interim results (updating)
  onFinalTranscript: (text: string) => void;      // final results (appended)
  onError: (error: string) => void;
}

interface UseTranscribeSocketReturn {
  startStreaming: () => void;
  stopStreaming: () => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;
  isConnected: boolean;
  isStreaming: boolean;
}
```

**WebSocket events (client → server):**

| Event | Payload | Description |
|-------|---------|-------------|
| `transcribe:start` | `{ attemptId, questionId, languageCode: 'en-US' }` | Initialize STT session |
| `transcribe:audio` | `{ chunk: ArrayBuffer }` | Send audio data chunk |
| `transcribe:stop` | `{ attemptId, questionId }` | End STT session |

**WebSocket events (server → client):**

| Event | Payload | Description |
|-------|---------|-------------|
| `transcribe:partial` | `{ text: string, questionId: string }` | Interim transcript (overwrites previous partial) |
| `transcribe:final` | `{ text: string, questionId: string }` | Final transcript segment (append to result) |
| `transcribe:error` | `{ message: string }` | STT error |
| `transcribe:ready` | `{ questionId: string }` | Session ready, can send audio |

**Connection:** Reuses the existing Socket.io infrastructure at namespace `/transcribe` (separate from `/chat`).

```typescript
import { io, Socket } from 'socket.io-client';

// Connect to transcribe namespace
const socket = io(`${API_URL}/transcribe`, {
  auth: { token: accessToken },
  transports: ['websocket'],
});
```

**Audio chunking strategy:**
- MediaRecorder `ondataavailable` fires every 250ms (`timeslice: 250`)
- Each chunk (~4-8KB at 16kHz mono) sent immediately via `transcribe:audio`
- AWS Transcribe Streaming processes chunks and returns results in ~2-3s

#### 3.8.3 AudioWaveform Component

**File:** `web/src/components/speaking/AudioWaveform.tsx`

Real-time waveform visualization using Web Audio API `AnalyserNode`.

```typescript
interface AudioWaveformProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
  height?: number;    // default 60
  barCount?: number;  // default 40
}
```

**Implementation:**
- Uses `requestAnimationFrame` loop while recording
- Reads frequency data from `AnalyserNode.getByteFrequencyData()`
- Renders as vertical bars (CSS or Canvas)
- Bars animate in real-time, showing voice activity
- Stops animation when `isRecording = false`

```
Active:    ▁ ▃ ▅ ▇ █ ▇ ▅ ▃ ▁ ▃ ▅ ▇ ▅ ▃ ▁ ▃ ▅ ▇ █ ▇
Idle:      ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁ ▁
```

### 3.4 Layout Router Update

**File:** `web/src/components/attempt-layouts/layout-router.tsx`

```typescript
// Add before existing HSK_WRITING_TYPES check
const TOEIC_SW_TYPES = [
  'WRITE_SENTENCES', 'RESPOND_WRITTEN_REQUEST', 'WRITE_OPINION_ESSAY',
  'READ_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_TO_QUESTIONS',
  'PROPOSE_SOLUTION', 'EXPRESS_OPINION',
];

const hasToeicSwQuestions = section.questionGroups.some((g) =>
  TOEIC_SW_TYPES.includes(g.questionType),
);

// Must come BEFORE hasWritingQuestions (HSK) check
if (hasToeicSwQuestions) {
  return <ToeicSwLayout {...props} />;
}
```

### 3.5 ToeicSwLayout

**File:** `web/src/components/attempt-layouts/toeic-sw-layout.tsx`

Thin wrapper similar to `WritingQuestionsLayout`. Vertically stacks question groups. Each renderer handles its own two-column layout internally.

```typescript
export function ToeicSwLayout({ section, answers, onAnswer }: LayoutProps) {
  const sortedGroups = [...section.questionGroups].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );

  return (
    <div className="md:flex-1 md:overflow-y-auto">
      {section.instructions && (
        <div className="px-6 pt-4 pb-2 text-slate-600 italic text-sm">
          {section.instructions}
        </div>
      )}
      {sortedGroups.map((group, idx) => (
        <div key={group.id}>
          {idx > 0 && <hr className="border-t border-slate-200" />}
          <QuestionGroupRenderer
            group={group}
            answers={answers}
            onAnswer={onAnswer}
          />
        </div>
      ))}
    </div>
  );
}
```

### 3.6 QuestionGroupRenderer Wiring

**File:** `web/src/components/question-renderers/index.tsx`

Add after existing `isPictureComposition` check (~line 92):

```typescript
// TOEIC SW Writing
const isWriteSentences = group.questionType === 'WRITE_SENTENCES';
const isRespondWrittenRequest = group.questionType === 'RESPOND_WRITTEN_REQUEST';
const isWriteOpinionEssay = group.questionType === 'WRITE_OPINION_ESSAY';

// TOEIC SW Speaking
const isSpeaking = [
  'READ_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_TO_QUESTIONS',
  'PROPOSE_SOLUTION', 'EXPRESS_OPINION',
].includes(group.questionType);

if (isWriteSentences) {
  return <WriteSentencesRenderer group={group} questions={sortedQuestions} answers={answers} onAnswer={onAnswer} />;
}
if (isRespondWrittenRequest) {
  return <RespondWrittenRequestRenderer group={group} questions={sortedQuestions} answers={answers} onAnswer={onAnswer} />;
}
if (isWriteOpinionEssay) {
  return <WriteOpinionEssayRenderer group={group} questions={sortedQuestions} answers={answers} onAnswer={onAnswer} />;
}
if (isSpeaking) {
  return <SpeakingQuestionRenderer group={group} questions={sortedQuestions} answers={answers} onAnswer={onAnswer} />;
}
```

### 3.7 Result Page Updates

**File:** `web/src/app/(learner)/tests/[id]/result/page.tsx`

#### 3.7.1 Type Updates

```typescript
// Add to AttemptResultFromAPI
interface AttemptResultFromAPI {
  // ... existing fields
  test: { id: string; title: string; examType: string }; // Add examType
  answers: AnswerFromAPI[];
}

// Add evaluation to AnswerFromAPI
interface AnswerFromAPI {
  id: string;
  questionId: string;
  answerText: string | null;
  isCorrect: boolean | null;
  evaluation?: WritingEvaluationFromAPI | null; // NEW
}

interface WritingEvaluationFromAPI {
  id: string;
  grammarScore: number;
  vocabScore: number;
  contentScore: number;
  overallScore: number;
  feedback: string;
  grammarErrors: Array<{ text: string; correction: string; rule: string }> | null;
  vocabAnalysis: Record<string, unknown> | null;
}
```

#### 3.7.2 Question Type Labels

Add to `getQuestionTypeLabel`:

```typescript
WRITE_SENTENCES: "Write Sentences (Q1-5)",
RESPOND_WRITTEN_REQUEST: "Respond to Written Request (Q6-7)",
WRITE_OPINION_ESSAY: "Opinion Essay (Q8)",
READ_ALOUD: "Read Aloud (Q1-2)",
DESCRIBE_PICTURE: "Describe a Picture (Q3-4)",
RESPOND_TO_QUESTIONS: "Respond to Questions (Q5-7)",
PROPOSE_SOLUTION: "Respond Using Information (Q8-10)",
EXPRESS_OPINION: "Express an Opinion (Q11)",
```

#### 3.7.3 TOEIC SW Result Display

**New file:** `web/src/components/toeic-sw/ToeicSwResultContent.tsx`

**Score Overview:**
```
+---------------+  +---------------+  +---------------+
| Speaking      |  | Writing       |  | Total         |
| 140 / 200     |  | 160 / 200     |  | 300 / 400     |
+---------------+  +---------------+  +---------------+
```

**Per-Question Evaluation:**
```
+-----------------------------------------------+
| Q1 - Write Sentences                          |
| Your answer: "The man is reading a newspaper" |
|                                               |
| Grammar: 85/100  Vocabulary: 90/100           |
| Content: 80/100  Overall: 85/100              |
|                                               |
| Feedback: "Good sentence structure. The       |
| sentence accurately describes the image..."   |
+-----------------------------------------------+
```

**Pending state:** If `answer.isCorrect === null` and no evaluation, show spinner with "AI is grading your responses..." and poll via `refetchInterval: 5000` in React Query.

---

## 4. Backend Specification

### 4.1 File Structure

```
api/src/
  transcribe/
    transcribe.module.ts                        # NEW
    transcribe.gateway.ts                       # NEW - WebSocket gateway for STT streaming
    transcribe.service.ts                       # NEW - AWS Transcribe Streaming wrapper
  toeic-grading/
    toeic-grading.module.ts                     # NEW
    toeic-grading.service.ts                    # NEW
    prompts/
      writing-system-prompt.ts                  # NEW
  attempts/
    attempts.service.ts                         # MODIFY
    attempts.module.ts                          # MODIFY
  scoring/
    scoring.service.ts                          # MODIFY
  hsk-grading/
    hsk-grading.service.ts                      # MODIFY
  app.module.ts                                 # MODIFY
```

### 4.2 ToeicGradingModule

**File:** `api/src/toeic-grading/toeic-grading.module.ts`

```typescript
@Module({
  providers: [ToeicGradingService],
  exports: [ToeicGradingService],
})
export class ToeicGradingModule {}
```

Dependencies: `PrismaService` (global), `BedrockService` (global via BedrockModule).

### 4.3 Real-Time Speech-to-Text Pipeline (AWS Transcribe Streaming)

#### 4.3.1 Architecture Overview

```
Browser                    NestJS Server                  AWS
+----------+     WS      +------------------+    HTTPS   +------------------+
| Mic      |──────────────| TranscribeGateway|───────────>| AWS Transcribe   |
| (MediaRec|  audio chunks| (Socket.io /     |  audio    | Streaming API    |
|  order)  |              |  transcribe)     |  stream   |                  |
|          |<─────────────|                  |<──────────| Returns partial  |
| Display  |  transcript  |  TranscribeService            | & final results  |
| live text|  events      |                  |            |                  |
+----------+              +------------------+            +------------------+
```

**Data Flow (step-by-step):**

```
1. Client clicks "Record"
   → navigator.mediaDevices.getUserMedia({ audio: true })
   → MediaRecorder created (audio/webm, timeslice: 250ms)
   → Socket.io emits 'transcribe:start' { attemptId, questionId, lang: 'en-US' }

2. Server receives 'transcribe:start'
   → Validates JWT auth (reuses Cognito token from socket handshake)
   → Creates AWS TranscribeStreamingClient
   → Opens StartStreamTranscriptionCommand with:
     - LanguageCode: 'en-US'
     - MediaEncoding: 'pcm' (converted from webm on server)
     - MediaSampleRateHertz: 16000
   → Stores session in Map<socketId+questionId, TranscribeSession>
   → Emits 'transcribe:ready' to client

3. Client's MediaRecorder.ondataavailable fires every 250ms
   → Audio Blob (~4-8KB) converted to ArrayBuffer
   → Socket.io emits 'transcribe:audio' { chunk: ArrayBuffer }

4. Server receives 'transcribe:audio'
   → Converts webm/opus chunk to raw PCM (via ffmpeg or AudioContext decode)
   → Feeds PCM bytes into the AWS Transcribe audio stream

5. AWS Transcribe returns results (~2-3s latency)
   → Partial results: interim text that may change
   → Final results: confirmed text segment
   → Server emits to client:
     'transcribe:partial' { text, questionId }  (overwrite display)
     'transcribe:final'   { text, questionId }  (append to transcript)

6. Client receives transcript events
   → Partial: update "streaming" text display (gray, may change)
   → Final: append to confirmed transcript, call onAnswer(questionId, fullText)

7. Client clicks "Stop"
   → MediaRecorder.stop()
   → Socket.io emits 'transcribe:stop'
   → Server closes AWS Transcribe stream
   → Server emits any remaining final results
   → Session cleaned up from Map
```

#### 4.3.2 TranscribeModule

**File:** `api/src/transcribe/transcribe.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TranscribeGateway } from './transcribe.gateway';
import { TranscribeService } from './transcribe.service';

@Module({
  providers: [TranscribeGateway, TranscribeService],
  exports: [TranscribeService],
})
export class TranscribeModule {}
```

**New dependency:** `@aws-sdk/client-transcribe-streaming` (add to `api/package.json`)

#### 4.3.3 TranscribeService

**File:** `api/src/transcribe/transcribe.service.ts`

Wraps AWS Transcribe Streaming SDK. Manages per-session streams.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
} from '@aws-sdk/client-transcribe-streaming';
import { PassThrough } from 'stream';

interface TranscribeSession {
  audioStream: PassThrough;         // Writable stream for feeding audio
  abortController: AbortController; // To cancel the AWS request
  questionId: string;
  fullTranscript: string;           // Accumulated final results
}

@Injectable()
export class TranscribeService {
  private readonly logger = new Logger(TranscribeService.name);
  private readonly client: TranscribeStreamingClient;

  // Active sessions: key = `${socketId}:${questionId}`
  private readonly sessions = new Map<string, TranscribeSession>();

  constructor() {
    this.client = new TranscribeStreamingClient({
      region: process.env.AWS_TRANSCRIBE_REGION || process.env.AWS_REGION || 'us-east-1',
      // Uses IAM role credentials (ECS task role or local AWS profile)
    });
  }

  /**
   * Start a new transcription session.
   * Returns an async iterable of transcript events.
   */
  async startSession(
    sessionKey: string,
    questionId: string,
    languageCode: string = 'en-US',
    onPartial: (text: string) => void,
    onFinal: (text: string) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    // Clean up any existing session for this key
    await this.stopSession(sessionKey);

    const audioStream = new PassThrough();
    const abortController = new AbortController();

    const session: TranscribeSession = {
      audioStream,
      abortController,
      questionId,
      fullTranscript: '',
    };
    this.sessions.set(sessionKey, session);

    // Create the async audio stream generator
    const audioStreamGenerator = async function* () {
      for await (const chunk of audioStream) {
        yield { AudioEvent: { AudioChunk: chunk } };
      }
    };

    try {
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: languageCode,
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: 16000,
        AudioStream: audioStreamGenerator(),
        EnablePartialResultsStabilization: true,
        PartialResultsStability: 'medium',
      });

      const response = await this.client.send(command, {
        abortSignal: abortController.signal,
      });

      // Process results stream
      if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
          if (!this.sessions.has(sessionKey)) break; // Session was stopped

          if (event.TranscriptEvent?.Transcript?.Results) {
            for (const result of event.TranscriptEvent.Transcript.Results) {
              const text = result.Alternatives?.[0]?.Transcript || '';
              if (!text) continue;

              if (result.IsPartial) {
                onPartial(text);
              } else {
                session.fullTranscript += (session.fullTranscript ? ' ' : '') + text;
                onFinal(session.fullTranscript);
              }
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.logger.error(`Transcribe session error [${sessionKey}]:`, err);
        onError(err as Error);
      }
    } finally {
      this.sessions.delete(sessionKey);
    }
  }

  /**
   * Feed audio data into an active session.
   * Expects raw PCM 16-bit LE mono 16kHz.
   */
  feedAudio(sessionKey: string, pcmChunk: Buffer): void {
    const session = this.sessions.get(sessionKey);
    if (!session) return;
    session.audioStream.write(pcmChunk);
  }

  /**
   * Stop and clean up a session.
   */
  async stopSession(sessionKey: string): Promise<string | null> {
    const session = this.sessions.get(sessionKey);
    if (!session) return null;

    const transcript = session.fullTranscript;
    session.audioStream.end();  // Signal end of audio
    // Wait briefly for final results, then abort if still running
    setTimeout(() => {
      if (this.sessions.has(sessionKey)) {
        session.abortController.abort();
        this.sessions.delete(sessionKey);
      }
    }, 3000);

    return transcript;
  }

  /** Get current transcript for a session */
  getTranscript(sessionKey: string): string {
    return this.sessions.get(sessionKey)?.fullTranscript || '';
  }
}
```

#### 4.3.4 TranscribeGateway

**File:** `api/src/transcribe/transcribe.gateway.ts`

WebSocket gateway on namespace `/transcribe`. Handles audio streaming and transcript delivery.

```typescript
import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { TranscribeService } from './transcribe.service';

@WebSocketGateway({
  namespace: '/transcribe',
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
export class TranscribeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private transcribeService: TranscribeService) {}

  // Auth: extract JWT from socket handshake (same pattern as ChatGateway)
  async handleConnection(client: Socket) {
    // Validate JWT from client.handshake.auth.token or cookies
    // Attach userId to client.data.userId
    // Reject unauthorized connections
  }

  handleDisconnect(client: Socket) {
    // Clean up all active sessions for this socket
    // Iterate sessions map and stop any belonging to client.id
  }

  @SubscribeMessage('transcribe:start')
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { attemptId: string; questionId: string; languageCode?: string },
  ) {
    const sessionKey = `${client.id}:${data.questionId}`;

    await this.transcribeService.startSession(
      sessionKey,
      data.questionId,
      data.languageCode || 'en-US',
      // onPartial
      (text) => client.emit('transcribe:partial', { text, questionId: data.questionId }),
      // onFinal
      (text) => client.emit('transcribe:final', { text, questionId: data.questionId }),
      // onError
      (err) => client.emit('transcribe:error', { message: err.message, questionId: data.questionId }),
    );
  }

  @SubscribeMessage('transcribe:audio')
  handleAudio(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chunk: ArrayBuffer; questionId: string },
  ) {
    const sessionKey = `${client.id}:${data.questionId}`;
    // Convert incoming audio to PCM 16-bit LE mono 16kHz
    const pcmBuffer = this.convertToPcm(Buffer.from(data.chunk));
    this.transcribeService.feedAudio(sessionKey, pcmBuffer);
  }

  @SubscribeMessage('transcribe:stop')
  async handleStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { questionId: string },
  ) {
    const sessionKey = `${client.id}:${data.questionId}`;
    const finalTranscript = await this.transcribeService.stopSession(sessionKey);
    if (finalTranscript) {
      client.emit('transcribe:final', { text: finalTranscript, questionId: data.questionId });
    }
  }

  /**
   * Convert audio chunk to PCM format required by AWS Transcribe.
   * Input: webm/opus chunk from MediaRecorder
   * Output: PCM 16-bit LE, mono, 16kHz
   *
   * Implementation options:
   * Option A (recommended): Use 'prism-media' package for lightweight transcoding
   * Option B: Use fluent-ffmpeg (requires ffmpeg binary)
   * Option C: Send PCM directly from browser using AudioWorklet (no server conversion)
   */
  private convertToPcm(chunk: Buffer): Buffer {
    // See Section 4.3.5 for audio conversion strategy
    return chunk;
  }
}
```

#### 4.3.5 Audio Format Conversion Strategy

AWS Transcribe Streaming requires **PCM 16-bit LE, mono, 16kHz**. Browser's MediaRecorder outputs **webm/opus**. Three strategies:

**Option A: Browser-side PCM (Recommended)**

Avoid server-side conversion entirely. Use `AudioWorkletNode` in the browser to capture raw PCM:

```typescript
// In SpeakingRecorder.tsx
const audioContext = new AudioContext({ sampleRate: 16000 });
const source = audioContext.createMediaStreamSource(micStream);
const worklet = await audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
const processorNode = new AudioWorkletNode(audioContext, 'pcm-processor');

processorNode.port.onmessage = (event) => {
  // event.data = Float32Array of PCM samples
  const pcm16 = float32ToPcm16(event.data);
  socket.emit('transcribe:audio', { chunk: pcm16.buffer, questionId });
};

source.connect(processorNode);
```

**AudioWorklet processor** (`public/audio-worklet-processor.js`):
```javascript
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0][0]; // mono channel
    if (input) {
      this.port.postMessage(input); // Float32Array
    }
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);
```

**Float32 to PCM16 conversion** (in browser):
```typescript
function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}
```

This approach:
- No server-side audio conversion needed
- Lower bandwidth (PCM16 is smaller than webm/opus for short chunks)
- AudioWorklet runs off main thread (no UI jank)
- `convertToPcm()` in gateway becomes a pass-through

**Option B: Server-side with prism-media** (fallback)

```bash
npm install prism-media
```

```typescript
import { opus } from 'prism-media';
// Decode opus to PCM on server
```

#### 4.3.6 Session Lifecycle & Cleanup

| Event | Action |
|-------|--------|
| Socket disconnect | Stop all sessions for that socket, cleanup AWS streams |
| `transcribe:stop` | End audio stream, wait 3s for final results, then abort |
| Server shutdown | Abort all active sessions |
| Timeout (no audio for 30s) | Auto-stop session, emit final transcript |
| Error (AWS) | Emit error to client, cleanup session |

**Memory management:** Each active session holds:
- ~16KB buffer for audio stream
- AWS SDK connection state
- Accumulated transcript string

Estimated: ~50KB per active session. At 1000 concurrent users = ~50MB.

### 4.4 ToeicGradingService

**File:** `api/src/toeic-grading/toeic-grading.service.ts`

Follows the exact same pattern as `HskGradingService`.

#### 4.3.1 Class Structure

```typescript
@Injectable()
export class ToeicGradingService {
  private readonly logger = new Logger(ToeicGradingService.name);
  private readonly regradeCooldowns = new Map<string, number>();
  private static readonly REGRADE_COOLDOWN_MS = 60_000;

  constructor(
    private prisma: PrismaService,
    private bedrock: BedrockService,
    private scoring: ScoringService,
  ) {}
}
```

#### 4.3.2 Method: `queueWritingGrading(attemptId, answerIds)`

Identical to HSK version. Fire-and-forget async grading per answer. On failure, creates a `WritingEvaluation` with `overallScore: -1`.

```typescript
async queueWritingGrading(attemptId: string, answerIds: string[]): Promise<void> {
  for (const answerId of answerIds) {
    this.gradeWritingAnswer(answerId).catch(async (err) => {
      this.logger.error(`Failed to grade TOEIC answer ${answerId}:`, err);
      await this.prisma.writingEvaluation.create({
        data: {
          answerId,
          examType: 'TOEIC_SW',
          grammarScore: 0, vocabScore: 0, contentScore: 0,
          overallScore: -1,
          feedback: `AI grading failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          modelUsed: 'error',
        },
      }).catch(() => {});
    });
  }

  // After all grading completes, recalculate attempt score
  // This is handled inside each gradeWritingAnswer call
}
```

#### 4.3.3 Method: `gradeWritingAnswer(answerId)`

```typescript
async gradeWritingAnswer(answerId: string): Promise<WritingEvaluation> {
  // 1. Remove any previous failed evaluation
  await this.prisma.writingEvaluation.deleteMany({
    where: { answerId, overallScore: -1 },
  });

  // 2. Fetch answer with question context
  const answer = await this.prisma.userAnswer.findUniqueOrThrow({
    where: { id: answerId },
    include: {
      question: {
        include: {
          group: { include: { section: true } },
        },
      },
      attempt: true,
    },
  });

  // 3. Build prompt based on question type
  const prompt = this.buildPrompt(answer.question, answer.answerText || '');

  // 4. Call Bedrock
  const response = await this.bedrock.messages.create({
    max_tokens: 1500,
    system: TOEIC_WRITING_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  // 5. Parse JSON response (same extraction logic as HSK)
  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = rawText.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
  const parsed = JSON.parse(jsonStr);

  // 6. Validate required fields
  for (const key of ['grammarScore', 'vocabScore', 'contentScore', 'overallScore']) {
    if (typeof parsed[key] !== 'number') throw new Error(`Missing: ${key}`);
  }

  // 7. Save evaluation
  const evaluation = await this.prisma.writingEvaluation.create({
    data: {
      answerId,
      examType: 'TOEIC_SW',
      hskLevel: null,
      grammarScore: parsed.grammarScore,
      vocabScore: parsed.vocabScore,
      contentScore: parsed.contentScore,
      overallScore: parsed.overallScore,
      feedback: parsed.feedback || '',
      vocabAnalysis: parsed.vocabAnalysis ?? undefined,
      grammarErrors: parsed.grammarErrors ?? undefined,
      modelUsed: 'bedrock:claude-3.5-haiku',
    },
  });

  // 8. Update answer isCorrect
  await this.prisma.userAnswer.update({
    where: { id: answerId },
    data: { isCorrect: parsed.overallScore >= 60 },
  });

  // 9. Recalculate attempt scores
  await this.recalculateAttemptScore(answer.attemptId);

  return evaluation;
}
```

#### 4.3.4 Method: `recalculateAttemptScore(attemptId)`

After each answer is graded, recalculate the attempt's scaled score:

```typescript
async recalculateAttemptScore(attemptId: string): Promise<void> {
  const attempt = await this.prisma.userAttempt.findUnique({
    where: { id: attemptId },
    include: {
      test: true,
      answers: {
        include: {
          evaluation: true,
          question: {
            include: { group: { include: { section: true } } },
          },
        },
      },
    },
  });
  if (!attempt || attempt.test.examType !== 'TOEIC_SW') return;

  // Aggregate scores by skill
  const skillScores = new Map<string, { total: number; count: number }>();

  for (const answer of attempt.answers) {
    const skill = answer.question.group.section.skill;
    const score = answer.evaluation?.overallScore ?? 0;
    if (score < 0) continue; // Skip failed evaluations

    const existing = skillScores.get(skill) || { total: 0, count: 0 };
    existing.total += score;
    existing.count += 1;
    skillScores.set(skill, existing);
  }

  // Calculate scaled scores: avg(0-100) -> map to 0-200
  const sectionScores: Record<string, { scaled: number; correct: number; total: number }> = {};
  let totalScaled = 0;

  for (const [skill, { total, count }] of skillScores) {
    const avgScore = count > 0 ? total / count : 0;
    const scaled = Math.round(avgScore * 2); // 0-100 -> 0-200
    sectionScores[skill.toLowerCase()] = {
      scaled,
      correct: 0, // Not applicable for AI-graded
      total: count,
    };
    totalScaled += scaled;
  }

  await this.prisma.userAttempt.update({
    where: { id: attemptId },
    data: {
      scaledScore: totalScaled,
      sectionScores: sectionScores as unknown as Prisma.InputJsonValue,
    },
  });
}
```

#### 4.3.5 Method: `buildPrompt(question, answerText)`

```typescript
private buildPrompt(
  question: {
    stem: string | null;
    metadata: unknown;
    group: { questionType: string; instructions: string | null };
  },
  answerText: string,
): string {
  const type = question.group.questionType;
  let prompt = `## Question Type: ${type}\n\n`;

  switch (type) {
    case 'WRITE_SENTENCES':
      prompt += `## Task: Write a sentence based on a picture using given keywords\n`;
      prompt += `## Keywords/Prompt: ${question.stem || 'N/A'}\n`;
      prompt += `## Note: The student was shown a picture and asked to write ONE sentence using the provided keywords.\n\n`;
      break;

    case 'RESPOND_WRITTEN_REQUEST':
      prompt += `## Task: Respond to a written email/letter request\n`;
      prompt += `## Email Content:\n${question.group.instructions || question.stem || 'N/A'}\n\n`;
      break;

    case 'WRITE_OPINION_ESSAY':
      prompt += `## Task: Write an opinion essay (target: 300+ words)\n`;
      prompt += `## Essay Prompt: ${question.stem || question.group.instructions || 'N/A'}\n\n`;
      break;

    // Speaking types (Phase 1: graded as text responses)
    case 'READ_ALOUD':
      prompt += `## Task: Read the following text aloud (student typed their response)\n`;
      prompt += `## Original Text: ${question.stem || 'N/A'}\n`;
      prompt += `## Note: Grade the text accuracy compared to the original.\n\n`;
      break;

    case 'DESCRIBE_PICTURE':
      prompt += `## Task: Describe a picture\n`;
      prompt += `## Prompt: ${question.stem || 'Describe the picture in detail'}\n\n`;
      break;

    case 'RESPOND_TO_QUESTIONS':
    case 'PROPOSE_SOLUTION':
      prompt += `## Task: Respond to questions / Propose a solution\n`;
      prompt += `## Scenario: ${question.group.instructions || 'N/A'}\n`;
      prompt += `## Question: ${question.stem || 'N/A'}\n\n`;
      break;

    case 'EXPRESS_OPINION':
      prompt += `## Task: Express an opinion with reasons and details\n`;
      prompt += `## Topic: ${question.stem || 'N/A'}\n\n`;
      break;
  }

  const wordCount = answerText.trim().split(/\s+/).filter(Boolean).length;
  prompt += `## Student's Answer (${wordCount} words)\n${answerText || '(empty)'}\n`;

  return prompt;
}
```

### 4.4 TOEIC Writing System Prompt

**File:** `api/src/toeic-grading/prompts/writing-system-prompt.ts`

```typescript
export const TOEIC_WRITING_SYSTEM_PROMPT = `You are an official TOEIC Speaking & Writing examiner. Grade strictly per ETS TOEIC SW scoring rubrics.

## Scoring Criteria (each 0-100)

### 1. Grammar (grammarScore)
- Sentence structure correctness
- Subject-verb agreement
- Tense consistency and appropriateness
- Article and preposition usage
- Punctuation and capitalization

### 2. Vocabulary (vocabScore)
- Word choice accuracy and appropriateness
- Vocabulary range and variety
- Use of required keywords (for WRITE_SENTENCES)
- Business/academic register (for email/essay)

### 3. Content (contentScore)
- Task completion (all parts of the prompt addressed)
- Relevance to the topic/image
- Coherence and logical organization
- Supporting details and examples (for essays)
- Appropriate tone and format (for emails)

### 4. Overall (overallScore)
Weighted average:
- WRITE_SENTENCES: Grammar 40%, Vocabulary 30%, Content 30%
- RESPOND_WRITTEN_REQUEST: Grammar 25%, Vocabulary 25%, Content 50%
- WRITE_OPINION_ESSAY: Grammar 20%, Vocabulary 25%, Content 55%
- Speaking types: Grammar 30%, Vocabulary 30%, Content 40%

## Question Type-Specific Guidelines

### WRITE_SENTENCES (Q1-5)
- Student must write ONE grammatically correct sentence
- Must use BOTH provided keywords
- Sentence must relate to the picture shown
- Score 0 if keywords are missing or sentence is incoherent

### RESPOND_WRITTEN_REQUEST (Q6-7)
- Must address ALL points in the directions
- Appropriate email format and tone
- Professional business English
- Score heavily on task completion

### WRITE_OPINION_ESSAY (Q8)
- Clear thesis statement
- Supporting reasons with examples
- Organized paragraphs (intro, body, conclusion)
- Minimum 300 words expected (deduct contentScore if < 200 words)

### Speaking Types (typed responses in practice mode)
- Grade the content quality of the written response
- Evaluate as if it were a spoken response transcribed to text
- Focus on content relevance and completeness over length

## CRITICAL: Output Format

You MUST respond with ONLY a JSON object. No markdown, no code fences, no extra text.

{"grammarScore":0,"vocabScore":0,"contentScore":0,"overallScore":0,"feedback":"...","grammarErrors":[{"text":"...","correction":"...","rule":"..."}],"vocabAnalysis":{"strengths":[],"weaknesses":[],"suggestions":[]}}

Field details:
- grammarScore: integer 0-100
- vocabScore: integer 0-100
- contentScore: integer 0-100
- overallScore: integer 0-100 (weighted per question type above)
- feedback: 2-4 sentences. First in English, then Vietnamese translation.
- grammarErrors: array of {text, correction, rule} for each grammar mistake found
- vocabAnalysis: {strengths: string[], weaknesses: string[], suggestions: string[]}

## Rules
- Be strict but fair. TOEIC is a standardized test.
- Empty or near-empty answers should score 0-10.
- Perfect grammar with irrelevant content should still lose contentScore.
- Your ENTIRE response must be parseable by JSON.parse().`;
```

### 4.5 Attempt Submission Integration

**File:** `api/src/attempts/attempts.service.ts`

Add to `submitAttempt` method, in the grading loop after the existing HSK checks:

```typescript
// --- Existing code (lines 265-274) ---
} else if (
  questionType === 'KEYWORD_COMPOSITION' ||
  questionType === 'PICTURE_COMPOSITION'
) {
  pendingWritingAnswerIds.push(answer.id);
  await this.prisma.userAnswer.update({
    where: { id: answer.id },
    data: { isCorrect: null },
  });

// --- NEW: TOEIC SW types ---
} else if ([
  'WRITE_SENTENCES', 'RESPOND_WRITTEN_REQUEST', 'WRITE_OPINION_ESSAY',
  'READ_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_TO_QUESTIONS',
  'PROPOSE_SOLUTION', 'EXPRESS_OPINION',
].includes(questionType)) {
  pendingToeicWritingAnswerIds.push(answer.id);
  await this.prisma.userAnswer.update({
    where: { id: answer.id },
    data: { isCorrect: null },
  });

} else {
  // --- Existing smart matching (line 276+) ---
```

After the grading loop, queue TOEIC grading:

```typescript
// Existing HSK queue (lines 293-298)
if (pendingWritingAnswerIds.length > 0) {
  this.hskGradingService
    .queueWritingGrading(attemptId, pendingWritingAnswerIds)
    .catch((err) => this.logger.error('Failed to queue HSK writing grading', err));
}

// NEW: TOEIC queue
if (pendingToeicWritingAnswerIds.length > 0) {
  this.toeicGradingService
    .queueWritingGrading(attemptId, pendingToeicWritingAnswerIds)
    .catch((err) => this.logger.error('Failed to queue TOEIC writing grading', err));
}
```

**Constructor injection:** Add `private toeicGradingService: ToeicGradingService`.

### 4.6 Scoring Service Update

**File:** `api/src/scoring/scoring.service.ts`

Split TOEIC_LR and TOEIC_SW in `calculateAttemptScores`:

```typescript
calculateAttemptScores(examType: string, sections: SectionResult[]): AttemptScoreResult {
  // ...
  if (examType === 'TOEIC_LR') {
    return this.calculateToeicAttemptScores(sections);
  }
  if (examType === 'TOEIC_SW') {
    return this.calculateToeicSwAttemptScores(sections);
  }
  // ...
}

private calculateToeicSwAttemptScores(sections: SectionResult[]): AttemptScoreResult {
  // Initial submission: scores are 0 since AI grading is async
  // Real scores are filled in by ToeicGradingService.recalculateAttemptScore()
  const sectionScores: Record<string, ToeicSectionScore> = {};

  const bySkill = new Map<string, { correct: number; total: number; writingScore: number }>();
  for (const s of sections) {
    const key = s.skill.toLowerCase();
    const existing = bySkill.get(key) || { correct: 0, total: 0, writingScore: 0 };
    existing.total += s.total;
    existing.writingScore = s.writingScore ?? 0;
    bySkill.set(key, existing);
  }

  let totalScaled = 0;
  for (const [skill, { correct, total, writingScore }] of bySkill) {
    const scaled = Math.round(writingScore * 2); // 0-100 -> 0-200
    sectionScores[skill] = { correct, total, scaled };
    totalScaled += scaled;
  }

  return {
    bandScore: null,
    scaledScore: totalScaled,
    sectionScores,
  };
}
```

### 4.7 Writing Evaluations Endpoint Update

**File:** `api/src/hsk-grading/hsk-grading.service.ts`

Expand the `getWritingEvaluations` question type filter:

```typescript
// Change from:
questionType: { in: ['KEYWORD_COMPOSITION', 'PICTURE_COMPOSITION'] },

// To:
questionType: { in: [
  'KEYWORD_COMPOSITION', 'PICTURE_COMPOSITION',
  'WRITE_SENTENCES', 'RESPOND_WRITTEN_REQUEST', 'WRITE_OPINION_ESSAY',
  'READ_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_TO_QUESTIONS',
  'PROPOSE_SOLUTION', 'EXPRESS_OPINION',
] },
```

### 4.8 Result API Update

**File:** `api/src/attempts/attempts.service.ts` (`getResult` method)

```typescript
// Change test select to include examType:
test: { select: { id: true, title: true, examType: true } },

// Include evaluation in answers:
answers: {
  include: {
    evaluation: true,
  },
},
```

### 4.9 Module Registration

**File:** `api/src/app.module.ts` - Add to imports:
```typescript
import { ToeicGradingModule } from './toeic-grading/toeic-grading.module';

// In @Module imports array:
ToeicGradingModule,
```

**File:** `api/src/attempts/attempts.module.ts` - Add to imports:
```typescript
import { ToeicGradingModule } from '../toeic-grading/toeic-grading.module';

@Module({
  imports: [ScoringModule, HskGradingModule, ToeicGradingModule],
  // ...
})
```

---

## 5. Data Flow

### 5.1 Test Taking Flow

```
1. User starts attempt
   POST /attempts { testId, mode, sectionIds }
   → Creates UserAttempt (IN_PROGRESS)

2. User answers questions
   Frontend: onAnswer(questionId, text) → answers[questionId] = text
   Auto-save every 5s: POST /attempts/:id/answers/bulk { answers }
   → Upserts UserAnswer records

3. User submits
   POST /attempts/:id/submit
   → Grading loop:
     - TOEIC SW types → isCorrect: null, queue async AI grading
     - Other types → smart matching, isCorrect: true/false
   → Save attempt (status: SUBMITTED, scaledScore: 0 initially)
   → Fire-and-forget: toeicGradingService.queueWritingGrading()

4. AI grading (async, per answer)
   → Bedrock Claude call with TOEIC rubric prompt
   → Parse JSON response
   → Save WritingEvaluation
   → Update UserAnswer.isCorrect
   → Recalculate attempt scaledScore

5. User views results
   GET /attempts/:id/result
   → Returns attempt + sections + answers + evaluations
   → Frontend polls if any answer.isCorrect === null
```

### 5.2 Speaking Real-Time STT Flow

```
1. User navigates to Speaking section
   → SpeakingQuestionRenderer renders with SpeakingRecorder component
   → useTranscribeSocket hook connects to WS namespace /transcribe

2. User clicks "Record"
   → Request mic permission via getUserMedia({ audio: true })
   → If denied: fall back to manual textarea, show warning
   → If granted: create AudioContext (16kHz) + AudioWorkletNode
   → Emit 'transcribe:start' { attemptId, questionId, lang: 'en-US' }
   → Server creates AWS Transcribe Streaming session
   → Server emits 'transcribe:ready'

3. AudioWorklet captures PCM samples every ~250ms
   → Float32 → PCM16 conversion in browser
   → Emit 'transcribe:audio' { chunk: Int16Array.buffer }
   → Server feeds raw PCM into AWS Transcribe stream

4. AWS Transcribe returns results (~2-3s after speech)
   → Server receives TranscriptEvent
   → If partial: emit 'transcribe:partial' { text }
     → Client shows gray interim text (may change)
   → If final: emit 'transcribe:final' { text }
     → Client appends to confirmed transcript
     → Calls onAnswer(questionId, fullTranscript)
     → Auto-save picks up the answer on next 5s cycle

5. User clicks "Stop"
   → MediaRecorder stops, AudioWorklet disconnects
   → Emit 'transcribe:stop'
   → Server ends audio stream, waits 3s for final results
   → Server emits remaining 'transcribe:final' if any
   → Session cleaned up

6. User can edit transcript manually
   → Textarea below transcript is editable
   → Manual edits call onAnswer(questionId, editedText)
   → Final answer = whatever is in the textarea at submit time

7. User can re-record
   → Clears previous transcript
   → Starts new session from step 2
```

**Latency budget:**
```
Audio capture → WS send:       ~10ms
WS transport (client→server):  ~20-50ms
Server → AWS Transcribe:       ~10ms
AWS Transcribe processing:     ~1500-3000ms (first result)
AWS → Server → Client:         ~30-60ms
─────────────────────────────────────────
Total first-word latency:      ~2-3 seconds
Subsequent words:              ~500ms-1s (streaming)
```

### 5.3 Scoring Flow

```
TOEIC SW Scoring:

Per answer: AI overallScore (0-100)
Per skill:  Average of answer overallScores (0-100) → scaled to 0-200
Total:      Speaking (0-200) + Writing (0-200) = 0-400

Example:
  Writing Q1: 75, Q2: 80, Q3: 70, Q4: 85, Q5: 90, Q6: 65, Q7: 70, Q8: 75
  Writing avg: 76.25 → scaled: 153/200

  Speaking Q1: 80, Q2: 75, ... Q11: 70
  Speaking avg: 72 → scaled: 144/200

  Total: 153 + 144 = 297/400
```

---

## 6. UI/UX Details

### 6.1 Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| Mobile (< md) | Single column: stimulus stacked above textarea |
| Desktop (>= md) | Two-column: stimulus left (50%), response right (50%) |

### 6.2 Styling Tokens

| Element | Classes |
|---------|---------|
| Question badge | `inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs border border-amber-200` |
| Textarea | `w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-base outline-none focus:border-blue-500 resize-y` |
| Section divider | `border-t border-slate-200` |
| Info banner | `bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-sm` |
| Keyword highlight | `bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium` |
| Score card | `bg-white border-2 border-slate-200 rounded-xl p-6 text-center` |
| Eval badge (good) | `bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs font-semibold` |
| Eval badge (ok) | `bg-amber-100 text-amber-700 ...` |
| Eval badge (poor) | `bg-red-100 text-red-700 ...` |

### 6.3 Score Badge Thresholds

| Range | Color | Label |
|-------|-------|-------|
| 80-100 | Emerald/green | Excellent |
| 60-79 | Amber/yellow | Good |
| 40-59 | Orange | Needs Improvement |
| 0-39 | Red | Poor |

---

## 7. Error Handling

### 7.1 AI Grading Failures

- On Bedrock call failure: create `WritingEvaluation` with `overallScore: -1` and error message in `feedback`
- On JSON parse failure: same treatment
- Frontend: show "Grading failed. Retrying..." with retry button
- Auto-retry: `getWritingEvaluations` re-triggers grading for failed answers (60s cooldown)

### 7.2 Empty Answers

- Empty/blank answers: AI grades with score 0-10
- `answerText` is nullable — treat null as empty string in prompt

### 7.3 Speech-to-Text Failures

| Scenario | Handling |
|----------|----------|
| Mic permission denied | Show warning banner, fall back to manual textarea input |
| Mic not found (no device) | Same as denied - fallback to textarea |
| WebSocket disconnect during recording | Stop recording, keep transcript so far, show reconnect option |
| AWS Transcribe error (rate limit, service down) | Emit `transcribe:error`, client shows "Speech recognition unavailable" + falls back to textarea |
| No speech detected (silence for 30s) | Auto-stop session, keep any partial transcript |
| Browser tab hidden during recording | `visibilitychange` event pauses recording, warns user |
| Audio conversion failure | Log error, stop session, client falls back to textarea |

**Graceful degradation principle:** If STT fails at any point, the user can always type their response manually. The transcript textarea is always editable.

### 7.4 Network Interruption

- Existing auto-save (5s) and heartbeat (30s) mechanisms handle this
- If tab closes mid-test, `beforeunload` fires sendBeacon best-effort save
- Stale attempt cron auto-submits after heartbeat timeout
- WebSocket auto-reconnects via Socket.io built-in reconnection (3 attempts, 1s delay)

---

## 8. Testing & Verification

### 8.1 Manual Testing Checklist

1. **Admin:** Create TOEIC_SW test via wizard, add questions to all 8 sections
2. **Test Detail:** Verify test shows correct info (duration, sections, question count)
3. **Attempt - Writing Q1-5:** Image + keywords render, textarea works, word count updates
4. **Attempt - Writing Q6-7:** Email renders, textarea works, word count updates
5. **Attempt - Writing Q8:** Essay prompt renders, large textarea, word count works
6. **Attempt - Speaking (mic available):** Record button works, waveform shows, transcript streams in ~2-3s
7. **Attempt - Speaking (mic denied):** Warning shows, fallback textarea appears
8. **Attempt - Speaking (edit transcript):** User can edit STT output before submitting
9. **Attempt - Speaking (re-record):** Previous transcript clears, new session starts
10. **Auto-save:** Both writing and speaking answers persist across page refresh
11. **Submit:** All answers marked as pending (isCorrect: null)
12. **AI Grading:** Evaluations appear within 30-60 seconds
13. **Result Page:** Scores display, evaluation feedback shows, polling works
14. **Score Recalculation:** scaledScore updates after grading completes

### 8.2 Edge Cases

- Submit with empty answers → AI grades as 0-10
- Submit with only some sections selected (practice mode)
- Browser refresh during recording → recording stops, saved transcript preserved via auto-save
- AI grading timeout → failed evaluation → retry on result page visit
- Multiple concurrent TOEIC_SW attempts by same user
- Slow network → WebSocket audio chunks buffer, transcript arrives late but correctly
- User speaks in non-English → Transcribe returns whatever it hears, AI grading evaluates content

---

## 9. Files Changed Summary

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `web/src/components/toeic-sw/WordCounter.tsx` | CREATE | English word counter component |
| 2 | `web/src/components/speaking/SpeakingRecorder.tsx` | CREATE | Mic capture + live STT display |
| 3 | `web/src/components/speaking/useTranscribeSocket.ts` | CREATE | WebSocket hook for STT streaming |
| 4 | `web/src/components/speaking/AudioWaveform.tsx` | CREATE | Live waveform visualization |
| 5 | `web/public/audio-worklet-processor.js` | CREATE | AudioWorklet for PCM capture |
| 6 | `web/src/components/question-renderers/write-sentences-renderer.tsx` | CREATE | Writing Q1-5 renderer |
| 7 | `web/src/components/question-renderers/respond-written-request-renderer.tsx` | CREATE | Writing Q6-7 renderer |
| 8 | `web/src/components/question-renderers/write-opinion-essay-renderer.tsx` | CREATE | Writing Q8 renderer |
| 9 | `web/src/components/question-renderers/speaking-question-renderer.tsx` | CREATE | Speaking Q1-11 renderer (uses SpeakingRecorder) |
| 10 | `web/src/components/question-renderers/index.tsx` | MODIFY | Wire new renderers |
| 11 | `web/src/components/attempt-layouts/toeic-sw-layout.tsx` | CREATE | TOEIC SW layout wrapper |
| 12 | `web/src/components/attempt-layouts/layout-router.tsx` | MODIFY | Route to TOEIC SW layout |
| 13 | `web/src/components/toeic-sw/ToeicSwResultContent.tsx` | CREATE | Result display component |
| 14 | `web/src/app/(learner)/tests/[id]/result/page.tsx` | MODIFY | Add TOEIC SW result view |
| 15 | `api/src/transcribe/transcribe.module.ts` | CREATE | NestJS module for STT |
| 16 | `api/src/transcribe/transcribe.gateway.ts` | CREATE | WebSocket gateway for audio streaming |
| 17 | `api/src/transcribe/transcribe.service.ts` | CREATE | AWS Transcribe Streaming wrapper |
| 18 | `api/src/toeic-grading/toeic-grading.module.ts` | CREATE | NestJS module for grading |
| 19 | `api/src/toeic-grading/toeic-grading.service.ts` | CREATE | AI grading service |
| 20 | `api/src/toeic-grading/prompts/writing-system-prompt.ts` | CREATE | System prompt for TOEIC rubrics |
| 21 | `api/src/attempts/attempts.service.ts` | MODIFY | Integrate TOEIC grading |
| 22 | `api/src/attempts/attempts.module.ts` | MODIFY | Import ToeicGradingModule |
| 23 | `api/src/scoring/scoring.service.ts` | MODIFY | TOEIC SW scoring logic |
| 24 | `api/src/hsk-grading/hsk-grading.service.ts` | MODIFY | Expand eval query filter |
| 25 | `api/src/app.module.ts` | MODIFY | Register ToeicGradingModule + TranscribeModule |

### 9.1 New Dependencies

| Package | Location | Purpose |
|---------|----------|---------|
| `@aws-sdk/client-transcribe-streaming` | `api/package.json` | AWS Transcribe Streaming SDK |
