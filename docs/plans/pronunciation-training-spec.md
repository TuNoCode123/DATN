# Real-Time Pronunciation Training - Technical Specification

## 1. Overview

User sees a target sentence, hears TTS, speaks it. Audio streams to AWS Transcribe in real-time. After ~1.5s silence, the final transcript is captured and sent to AI (Bedrock) for assessment. AI returns scores (0-100) + status (master/good/fair/poor). UI shows target vs spoken comparison.

```
[Target Sentence] --> [Play TTS (Polly)] --> [User Speaks]
        --> [Stream to Transcribe (real-time)] --> [Silence 1.5s]
        --> [Final Transcript] --> [AI Assessment (Bedrock)]
        --> [Scores + Status + Comparison UI]
```

---

## 2. Flow (Step by Step)

1. **Display** target sentence + play TTS audio (Polly, cached in S3)
2. **User clicks "Start"** -> mic opens, audio streams via WebSocket to API
3. **API pipes** audio to AWS Transcribe Streaming -> partial transcripts shown live (gray text)
4. **Silence detected** (~1.5s no new words) -> take final transcript
5. **Send to Bedrock** AI: `{ target, spoken }` -> get assessment JSON
6. **Show results**: scores, status badge, word-by-word diff
7. **User can retry** or move to next sentence

---

## 3. Backend

### 3.1 New Files

```
api/src/
  pronunciation/
    pronunciation.module.ts
    pronunciation.gateway.ts      # WebSocket: mic audio <-> Transcribe
    pronunciation.controller.ts   # REST: TTS, assess
    pronunciation.service.ts      # AI assessment, scoring
  credits/
    credits.module.ts
    credits.controller.ts
    credits.service.ts
```

### 3.2 WebSocket Gateway (Transcribe Relay)

Namespace: `/pronunciation`

| Direction | Event | Payload |
|-----------|-------|---------|
| C -> S | `start` | `{ language: 'en-US' }` |
| C -> S | `audio` | `ArrayBuffer` (PCM 16kHz mono) |
| C -> S | `stop` | `{}` |
| S -> C | `partial` | `{ text: string }` — live partial transcript |
| S -> C | `final` | `{ text: string }` — confirmed transcript after silence |
| S -> C | `error` | `{ message: string }` |

**Gateway logic:**
- On `start`: open Transcribe Streaming session, deduct 5 credits
- On `audio`: pipe PCM chunks to Transcribe
- Transcribe partial results -> emit `partial` (show live gray text)
- Transcribe final result -> buffer; if no new result for 1.5s -> emit `final`
- On `stop` or disconnect: close Transcribe session

```typescript
// Silence detection (server-side timer)
private silenceTimers: Map<string, NodeJS.Timeout> = new Map();

onTranscribeResult(clientId: string, result: TranscribeResult) {
  const client = this.server.sockets.get(clientId);

  if (result.IsPartial) {
    client.emit('partial', { text: this.extractText(result) });
  } else {
    // Got a final segment — reset silence timer
    this.accumulateFinal(clientId, this.extractText(result));

    clearTimeout(this.silenceTimers.get(clientId));
    this.silenceTimers.set(clientId, setTimeout(() => {
      // 1.5s silence -> send accumulated final transcript
      const fullTranscript = this.getAccumulatedTranscript(clientId);
      client.emit('final', { text: fullTranscript });
    }, 1500));
  }
}
```

### 3.3 REST Endpoints

```
POST /api/pronunciation/tts
  Body: { sentence: string }
  Returns: { audioUrl: string }
  Logic: hash sentence -> check S3 -> if miss: Polly synthesize -> upload S3 -> return presigned URL

POST /api/pronunciation/assess
  Body: { target: string, spoken: string, language?: string }
  Returns: PronunciationAssessment
  Logic: send to Bedrock Claude -> parse structured response
```

### 3.4 AI Assessment (Bedrock)

```typescript
// pronunciation.service.ts

async assess(target: string, spoken: string): Promise<PronunciationAssessment> {
  const prompt = `You are a pronunciation and language coach. Compare the spoken text to the target text and assess.

Target: "${target}"
Spoken: "${spoken}"

Return JSON only:
{
  "pronunciation": { "score": 0-100, "status": "master|good|fair|poor" },
  "accuracy": { "score": 0-100, "status": "master|good|fair|poor" },
  "fluency": { "score": 0-100, "status": "master|good|fair|poor" },
  "completeness": { "score": 0-100, "status": "master|good|fair|poor" },
  "overall": { "score": 0-100, "status": "master|good|fair|poor" },
  "wordComparison": [
    { "target": "word", "spoken": "word"|null, "correct": true|false }
  ],
  "feedback": "One sentence of advice."
}

Scoring guide:
- pronunciation: how well words sound (infer from STT accuracy — if Transcribe got it right, pronunciation was clear)
- accuracy: how closely spoken matches target words
- fluency: natural flow, no stutters or excessive pauses
- completeness: % of target words spoken
- overall: weighted average

Status thresholds: master >= 90, good >= 70, fair >= 50, poor < 50`;

  const result = await this.bedrock.invoke(prompt);
  return JSON.parse(result);
}
```

### 3.5 Response Type

```typescript
interface ScoreItem {
  score: number;        // 0-100
  status: 'master' | 'good' | 'fair' | 'poor';
}

interface WordComparison {
  target: string;
  spoken: string | null;  // null = missed
  correct: boolean;
}

interface PronunciationAssessment {
  pronunciation: ScoreItem;
  accuracy: ScoreItem;
  fluency: ScoreItem;
  completeness: ScoreItem;
  overall: ScoreItem;
  wordComparison: WordComparison[];
  feedback: string;
}
```

---

## 4. Frontend

### 4.1 New Files

```
web/src/
  lib/pronunciation/
    use-pronunciation.ts        # Main hook
    use-transcribe-socket.ts    # WebSocket hook
    use-microphone.ts           # Mic capture hook
    types.ts                    # Types
  components/pronunciation/
    PronunciationTrainer.tsx     # Main component
    ScoreCard.tsx                # Score display with status badges
    WordDiff.tsx                 # Target vs spoken comparison
    CreditBadge.tsx             # Shows credit balance
  app/(learner)/
    pronunciation/page.tsx      # Standalone practice page
```

### 4.2 Main Hook

```typescript
// use-pronunciation.ts

function usePronunciation(targetSentence: string) {
  const [partialText, setPartialText] = useState('');        // Live gray text
  const [finalText, setFinalText] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'assessing' | 'done'>('idle');

  const socket = useTranscribeSocket();
  const mic = useMicrophone();

  async function start() {
    setPhase('listening');
    setPartialText('');
    setFinalText(null);
    setAssessment(null);
    socket.emit('start', { language: 'en-US' });
    await mic.start((chunk) => socket.emit('audio', chunk));
  }

  function stop() {
    mic.stop();
    socket.emit('stop');
  }

  // Listen for transcripts
  useEffect(() => {
    socket.on('partial', ({ text }) => setPartialText(text));
    socket.on('final', async ({ text }) => {
      setFinalText(text);
      mic.stop();
      socket.emit('stop');
      // Auto-assess
      setPhase('assessing');
      const result = await api.post('/pronunciation/assess', {
        target: targetSentence,
        spoken: text,
      });
      setAssessment(result.data);
      setPhase('done');
    });
    return () => socket.off();
  }, []);

  function retry() {
    setPhase('idle');
    setPartialText('');
    setFinalText(null);
    setAssessment(null);
  }

  return { partialText, finalText, assessment, phase, start, stop, retry };
}
```

### 4.3 PronunciationTrainer Component

```
+--------------------------------------------------+
|  Target Sentence                                  |
|  "The quick brown fox jumps over the lazy dog"    |
|                                [Play TTS]         |
+--------------------------------------------------+

|  You said:  (live partial in gray while speaking) |
|  "the quick brown fox jumps..."                   |
+--------------------------------------------------+

     [Start Speaking]  /  [Stop]  /  [Retry]

+--------------------------------------------------+  (after assessment)
|  Overall: 85 - GOOD                               |
|                                                    |
|  Pronunciation  [====== ] 82  good                |
|  Accuracy       [======= ] 90  master             |
|  Fluency        [=====  ] 78  good                |
|  Completeness   [======= ] 88  good               |
|                                                    |
|  Word Comparison:                                  |
|  The   quick  brown  fox  jumps  over  the  lazy  |
|  [ok]  [ok]   [ok]   [ok] [ok]   [ok] [ok] [miss]|
|                                                    |
|  Feedback: "Great job! You missed 'lazy' -        |
|  try slowing down at the end."                     |
+--------------------------------------------------+
```

### 4.4 ScoreCard Component

```typescript
// components/pronunciation/ScoreCard.tsx

const STATUS_STYLES = {
  master: 'bg-green-100 text-green-800 border-green-600',
  good:   'bg-blue-100 text-blue-800 border-blue-600',
  fair:   'bg-yellow-100 text-yellow-800 border-yellow-600',
  poor:   'bg-red-100 text-red-800 border-red-600',
};

function ScoreCard({ assessment }: { assessment: PronunciationAssessment }) {
  const metrics = ['pronunciation', 'accuracy', 'fluency', 'completeness'];

  return (
    <div className="brutal-card p-6 space-y-4">
      {/* Overall */}
      <div className="text-center">
        <div className="text-4xl font-black">{assessment.overall.score}</div>
        <span className={clsx(
          'px-3 py-1 text-sm font-bold border-2 border-black uppercase',
          STATUS_STYLES[assessment.overall.status],
        )}>
          {assessment.overall.status}
        </span>
      </div>

      {/* Individual scores */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(key => {
          const item = assessment[key];
          return (
            <div key={key} className="brutal-card p-3">
              <div className="text-xs uppercase text-gray-500">{key}</div>
              <div className="flex items-center gap-2">
                <div className="text-xl font-black">{item.score}</div>
                <span className={clsx(
                  'px-2 py-0.5 text-xs font-bold border border-black',
                  STATUS_STYLES[item.status],
                )}>
                  {item.status}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-gray-200 border border-black mt-1">
                <div className="h-full bg-black" style={{ width: `${item.score}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Feedback */}
      <p className="text-sm text-gray-700 italic">{assessment.feedback}</p>
    </div>
  );
}
```

### 4.5 WordDiff Component

```typescript
// components/pronunciation/WordDiff.tsx

function WordDiff({ words }: { words: WordComparison[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {words.map((w, i) => (
        <div key={i} className="text-center">
          <div className={clsx(
            'px-2 py-1 text-lg font-mono border-2 border-black',
            w.correct
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800 line-through',
          )}>
            {w.target}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {w.spoken ?? 'missed'}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 5. Credit System

### 5.1 Schema

```prisma
model UserCredit {
  id        String   @id @default(cuid())
  userId    String   @unique
  balance   Int      @default(100)
  updatedAt DateTime @updatedAt

  user         User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions CreditTransaction[]

  @@map("user_credits")
}

model CreditTransaction {
  id           String       @id @default(cuid())
  creditId     String
  amount       Int          // negative = deduction, positive = topup
  balanceAfter Int
  reason       CreditReason
  referenceId  String?
  createdAt    DateTime     @default(now())

  credit UserCredit @relation(fields: [creditId], references: [id], onDelete: Cascade)

  @@index([creditId, createdAt])
  @@map("credit_transactions")
}

enum CreditReason {
  SIGNUP_BONUS
  DAILY_BONUS
  PRONUNCIATION_SESSION
  POLLY_TTS
  AI_GRADING
  ADMIN_TOPUP
}
```

### 5.2 Costs

| Action | Credits | When |
|--------|---------|------|
| Session (Transcribe stream) | 5 | On `start` |
| TTS (Polly, cache miss only) | 1 | First time a sentence is spoken |
| AI Assessment (Bedrock) | 2 | After each `final` transcript |
| Signup bonus | +100 | Account creation |
| Daily bonus | +5 | First login of day |

### 5.3 Credit Endpoints

```
GET  /api/credits          -> { balance }
POST /api/credits/check    -> { sufficient: boolean, required: number }
POST /api/admin/credits/grant  -> { newBalance } (admin)
```

---

## 6. Persistence

Assessment results saved to existing models:

```typescript
// After AI assessment returns:
await prisma.userAnswer.upsert({
  where: { attemptId_questionId: { attemptId, questionId } },
  create: {
    attemptId, questionId,
    answerText: JSON.stringify({ spoken: finalText, assessment }),
    isCorrect: assessment.overall.score >= 70,
  },
  update: { ... },
});
```

`WritingEvaluation` reused:
- `grammarScore` -> pronunciation score
- `vocabScore` -> accuracy score
- `contentScore` -> fluency score
- `overallScore` -> overall score
- `feedback` -> AI feedback text
- `examType` -> `"PRONUNCIATION"`
- `modelUsed` -> `"bedrock:claude-haiku"`

---

## 7. AWS Requirements

| Service | Config |
|---------|--------|
| **Polly** | Engine: `neural`, Voice: `Joanna`, Output: `mp3` |
| **Transcribe Streaming** | `pcm`, `16kHz`, `en-US`, `PartialResultsStability: medium` |
| **S3** | Prefix: `tts/`, cache TTS audio |
| **Bedrock** | Claude Haiku for fast assessment |

IAM additions: `polly:SynthesizeSpeech`, `transcribe:StartStreamTranscription`

### New dependencies

Backend only: `@aws-sdk/client-polly`, `@aws-sdk/client-transcribe-streaming`

Frontend: none (uses native Web Audio API + existing socket.io-client)

---

## 8. Summary

| Step | What happens | Latency |
|------|-------------|---------|
| 1 | Show sentence + play TTS | ~200ms (S3 cached) |
| 2 | User speaks, partials shown live | ~300ms per partial |
| 3 | Silence 1.5s -> final transcript | 1.5s after last word |
| 4 | AI assessment via Bedrock | ~1-2s |
| 5 | Show scores + word diff + feedback | Instant render |
| **Total after speaking** | | **~3s** |
