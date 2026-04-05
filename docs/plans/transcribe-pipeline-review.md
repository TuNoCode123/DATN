# Real-Time Transcription Pipeline - Technical Review & Redesign

## Executive Summary

The current spec (toeic-sw-spec.md) describes a functional MVP. This document identifies **14 critical weaknesses** and proposes a production-hardened redesign with concrete implementation strategies.

---

## 1. Critical Weaknesses

### 1.1 No Client-Side Connection State Machine

**Problem:** The spec treats WebSocket connection as binary (connected/disconnected). In reality, the connection passes through multiple states, and mishandling transitions causes silent data loss.

**Scenario:** User is recording, WiFi drops for 2s, Socket.io auto-reconnects, but the `transcribe:start` session on the server was cleaned up on disconnect. Audio chunks sent after reconnection hit a dead session — silently dropped.

### 1.2 Audio Format Mismatch Risk

**Problem:** The spec proposes `new AudioContext({ sampleRate: 16000 })` — but browsers may ignore this hint. Chrome on Android commonly creates contexts at 48kHz regardless. If the actual sample rate is 48kHz and we send it as 16kHz to AWS Transcribe, the audio plays at 3x speed, producing garbage transcription.

**Fix required:** Always read `audioContext.sampleRate` after creation and resample if necessary.

### 1.3 AudioWorklet Chunk Timing Is Non-Deterministic

**Problem:** The spec says "captures audio every ~250ms" but AudioWorklet's `process()` fires per render quantum (128 samples). At 16kHz that's every 8ms. At 48kHz it's every 2.67ms. The spec conflates MediaRecorder's `timeslice` with AudioWorklet behavior — they're completely different mechanisms.

**Impact:** If we buffer 250ms of samples before sending, that's ~4000 samples at 16kHz = 8KB per chunk. But if the worklet sends every `process()` call, that's 256 bytes per chunk — ~125 WebSocket frames/second. Both extremes are bad.

### 1.4 No Backpressure Handling

**Problem:** The `feedAudio` method does a blind `audioStream.write(pcmChunk)` with no backpressure check. If the PassThrough stream's internal buffer fills up (AWS consuming slower than we're writing), Node.js will buffer unboundedly in memory.

**At scale:** 1000 concurrent users each buffering 16KB/s = 16MB/s of uncontrolled memory growth.

### 1.5 Race Condition: Stop + Final Results

**Problem:** The `stopSession` method ends the audio stream then sets a 3s timeout to abort. But `startSession` is iterating `TranscriptResultStream` in a `for await` loop. The abort kills the iterator mid-read, potentially losing the last final result.

**Worse:** The `stopSession` returns `session.fullTranscript` immediately — before the 3s window for final results. The gateway then emits this incomplete transcript as `transcribe:final`.

### 1.6 Race Condition: Autosave vs Transcript Append

**Problem:** Client flow:
1. Final transcript arrives: `fullTranscript = "Hello world"`, calls `onAnswer(qId, "Hello world")`
2. Auto-save fires, reads `answers[qId] = "Hello world"`, sends to server
3. Next final arrives: `fullTranscript = "Hello world. How are you"`, calls `onAnswer`
4. User edits textarea to `"Hello world. How are you doing"` — but auto-save already captured stale value

The 5s auto-save interval can save a mid-append state, and the textarea is the "source of truth" but is being mutated by both the STT stream and the user simultaneously.

### 1.7 Memory Leaks

| Resource | Leak Vector | Impact |
|----------|------------|--------|
| `AudioContext` | Not closed on unmount or error | Browser limits (6 per origin in Chrome) exhausted after a few re-records |
| `MediaStream` tracks | Not stopped on component unmount | Red recording indicator persists, mic stays hot |
| `AudioWorkletNode` | Not disconnected on stop | Keeps processing silence, wasting CPU |
| `AnalyserNode` | `requestAnimationFrame` loop not cancelled | Runs forever if component unmounts during recording |
| Server `sessions` Map | Socket disconnect during `startSession` async setup | Session created but never cleaned up if disconnect fires between Map.set and the for-await loop |
| `setTimeout` in `stopSession` | Fires after session already cleaned by disconnect handler | Double-cleanup, potential crash on deleted session |

### 1.8 No Authentication on Audio Chunks

**Problem:** The gateway validates JWT on `handleConnection` only. After connection, any `transcribe:audio` event is trusted. A malicious client could:
- Start a session with someone else's `attemptId`/`questionId` 
- Send garbage audio to waste AWS Transcribe costs
- Send audio to a question they haven't started an attempt for

**Fix:** Validate that `client.data.userId` owns the `attemptId` on `transcribe:start`.

### 1.9 No Rate Limiting on Audio Events

**Problem:** A malicious or buggy client can emit `transcribe:audio` at thousands of events/second. Each event triggers a `PassThrough.write()` and an AWS API write. The chat gateway has rate limiting (10 messages/5s) but transcribe has none.

### 1.10 SessionKey Uses `client.id` (Volatile)

**Problem:** `sessionKey = ${client.id}:${questionId}`. Socket.io's `client.id` changes on reconnection. After a reconnect, the client has a new `client.id`, so:
- Old session is orphaned (leaked until disconnect cleanup, but disconnect already fired)
- New `transcribe:start` creates a fresh session — all prior transcript context lost

### 1.11 No Maximum Recording Duration

**Problem:** A user can record indefinitely. AWS Transcribe Streaming has a hard limit of **4 hours** per stream, but each minute costs money (~$0.024/min). A stuck session or forgotten tab could run up costs.

### 1.12 No Silence Detection

**Problem:** If the user stops speaking but doesn't click Stop, audio chunks of silence continue streaming to AWS at full cost. AWS Transcribe does have built-in VAD, but we're still paying for the stream.

### 1.13 Server-Side Session Map Not Distributed

**Problem:** `sessions` is an in-memory `Map` on a single server instance. With multiple NestJS instances behind a load balancer (as implied by the Redis adapter for chat), a `transcribe:audio` event could hit a different instance than `transcribe:start`. The session won't be found.

### 1.14 No Fallback for WebSocket Failure

**Problem:** If the WebSocket connection fails entirely (corporate firewall, proxy stripping), there's no fallback path for speaking questions. The spec mentions "falls back to textarea" for mic denial, but not for transport-level failures.

---

## 2. Redesigned Architecture

### 2.1 Architecture Diagram

```
                        CLIENT (Browser)
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌──────────────┐   ┌──────────────┐                │
│  │ AudioContext  │   │  Connection  │                │
│  │  (16kHz or   │   │    State     │                │
│  │  resampled)  │   │   Machine    │                │
│  └──────┬───────┘   └──────┬───────┘                │
│         │                   │                        │
│  ┌──────▼───────┐   ┌──────▼───────┐                │
│  │ AudioWorklet │   │  Socket.io   │                │
│  │  Processor   │   │   Client     │                │
│  │ (ring buffer │   │ (/transcribe)│                │
│  │  + chunking) │   └──────┬───────┘                │
│  └──────┬───────┘          │                        │
│         │    PCM16 chunks  │                        │
│         └──────────────────┘                        │
│                                                      │
│  ┌──────────────┐   ┌──────────────┐                │
│  │ MediaRecorder│   │ Transcript   │                │
│  │ (fallback    │   │ Manager      │                │
│  │  full audio) │   │ (confirmed + │                │
│  └──────────────┘   │  partial)    │                │
│                      └──────────────┘                │
└──────────────────────────────────────────────────────┘
                         │ WebSocket
                         ▼
                    LOAD BALANCER
                  (sticky sessions by socketId)
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│                  NestJS Server                        │
│                                                      │
│  ┌──────────────┐   ┌──────────────┐                │
│  │ Transcribe   │   │  Session     │                │
│  │   Gateway    │──▶│  Registry    │                │
│  │ (auth +      │   │ (Map + TTL   │                │
│  │  rate limit) │   │  + userId)   │                │
│  └──────────────┘   └──────┬───────┘                │
│                             │                        │
│  ┌──────────────┐   ┌──────▼───────┐                │
│  │ Audio        │   │ Transcribe   │                │
│  │ Validator    │──▶│   Service    │                │
│  │ (rate limit, │   │ (AWS SDK)    │                │
│  │  size check) │   └──────┬───────┘                │
│  └──────────────┘          │                        │
│                             ▼                        │
│                   ┌──────────────┐                   │
│                   │ AWS Transcribe│                   │
│                   │  Streaming    │                   │
│                   └──────────────┘                   │
└──────────────────────────────────────────────────────┘
```

### 2.2 Client-Side State Machine

```
                    ┌─────────┐
                    │  IDLE   │◄──────────────────────────────┐
                    └────┬────┘                                │
                         │ user clicks Record                  │
                         ▼                                     │
                    ┌─────────────┐                            │
                    │ CONNECTING  │ (WS connect + transcribe:start)
                    └────┬────────┘                            │
                         │                                     │
              ┌──────────┼──────────┐                          │
              │          │          │                           │
              ▼          ▼          ▼                           │
        ┌─────────┐ ┌────────┐ ┌────────┐                     │
        │PERMISSN │ │WS_FAIL │ │TIMEOUT │                     │
        │_REQUEST │ │        │ │        │                     │
        └────┬────┘ └───┬────┘ └───┬────┘                     │
             │          │          │                           │
    ┌────────┤     ┌────┘          │                           │
    │        │     │               │                           │
    ▼        ▼     ▼               ▼                           │
┌──────┐ ┌──────┐ ┌───────────────────┐                       │
│DENIED│ │READY │ │   FALLBACK        │                       │
│      │ │      │ │ (textarea only)   │───────────────────────┘
└──┬───┘ └──┬───┘ └───────────────────┘         on done
   │        │
   │        │ transcribe:ready received
   │        ▼
   │   ┌──────────┐
   │   │RECORDING │◄────────────────┐
   │   └────┬─────┘                 │
   │        │                       │
   │   ┌────┼────────┐             │
   │   │    │        │             │
   │   ▼    ▼        ▼             │
   │ ┌────┐┌──────┐┌──────────┐   │
   │ │STOP││DISCON││MAX_TIME  │   │
   │ │    ││NECTED││_REACHED  │   │
   │ └─┬──┘└──┬───┘└────┬─────┘   │
   │   │      │          │         │
   │   │      ▼          │         │
   │   │ ┌──────────┐   │         │
   │   │ │RECONNECT │   │         │
   │   │ │_ING      │   │         │
   │   │ └────┬─────┘   │         │
   │   │   ┌──┴──┐      │         │
   │   │   ▼     ▼      │         │
   │   │ ┌───┐┌─────┐   │         │
   │   │ │OK ││FAIL │   │         │
   │   │ └─┬─┘└──┬──┘   │         │
   │   │   │     │      │         │
   │   │   │  ┌──┘      │         │
   │   │   │  │         │         │
   │   │   └──┼─────────┘         │
   │   │      │    resume          │
   │   │      │    recording ──────┘
   │   ▼      ▼
   │  ┌──────────┐
   │  │PROCESSING│ (waiting for final results, 3s)
   │  └────┬─────┘
   │       │
   │       ▼
   │  ┌──────────┐
   └─▶│  DONE    │ (transcript ready, editable)
      └────┬─────┘
           │ user clicks Re-record
           ▼
      ┌──────────┐
      │  IDLE    │ (transcript cleared)
      └──────────┘
```

**State Machine Definition (TypeScript):**

```typescript
type RecordingState =
  | 'idle'
  | 'connecting'       // WS connecting + transcribe:start sent
  | 'permission_request'
  | 'permission_denied'
  | 'ready'            // transcribe:ready received, mic granted
  | 'recording'        // actively streaming audio
  | 'disconnected'     // WS lost during recording
  | 'reconnecting'     // attempting to resume
  | 'processing'       // stop sent, waiting for final results
  | 'done'             // transcript ready
  | 'fallback'         // WS or mic failed, manual textarea only
  | 'error';

interface RecordingContext {
  state: RecordingState;
  sessionId: string | null;       // Server-assigned session ID (survives reconnects)
  confirmedTranscript: string;    // All confirmed final segments
  partialTranscript: string;      // Current interim text
  elapsedMs: number;
  errorMessage: string | null;
  reconnectAttempts: number;
  audioChunkQueue: ArrayBuffer[]; // Buffered during reconnect
}

type RecordingEvent =
  | { type: 'CLICK_RECORD' }
  | { type: 'MIC_GRANTED'; stream: MediaStream }
  | { type: 'MIC_DENIED' }
  | { type: 'WS_CONNECTED' }
  | { type: 'WS_DISCONNECTED' }
  | { type: 'WS_RECONNECTED' }
  | { type: 'WS_FAILED' }          // max reconnect attempts exceeded
  | { type: 'TRANSCRIBE_READY'; sessionId: string }
  | { type: 'TRANSCRIBE_PARTIAL'; text: string }
  | { type: 'TRANSCRIBE_FINAL'; text: string }
  | { type: 'TRANSCRIBE_ERROR'; message: string }
  | { type: 'CLICK_STOP' }
  | { type: 'PROCESSING_COMPLETE' }
  | { type: 'MAX_DURATION' }
  | { type: 'CLICK_RERECORD' }
  | { type: 'CLICK_FALLBACK' };     // user opts for manual entry
```

### 2.3 Server-Side State Machine

```
Per-Session States:

  INITIALIZING → STREAMING → DRAINING → CLOSED
       │              │          │
       ▼              ▼          ▼
     ERROR          ERROR      ERROR

INITIALIZING: AWS Transcribe command sent, waiting for stream ready
STREAMING:    Actively receiving audio chunks and forwarding to AWS
DRAINING:     Audio stream ended, waiting for final AWS results (max 5s)
CLOSED:       Session complete, resources released
ERROR:        Something failed, resources released, client notified
```

```typescript
// Server-side session (enhanced)
interface TranscribeSession {
  // Identity
  sessionId: string;              // UUID, survives reconnects
  userId: string;                 // Validated from JWT
  attemptId: string;              // Validated ownership
  questionId: string;
  socketId: string;               // Current socket (updated on reconnect)
  
  // State
  state: 'initializing' | 'streaming' | 'draining' | 'closed' | 'error';
  
  // AWS
  audioStream: PassThrough;
  abortController: AbortController;
  
  // Transcript
  confirmedSegments: string[];    // Array of final segments
  
  // Metrics & limits
  createdAt: number;
  lastAudioAt: number;
  totalBytesReceived: number;
  chunkCount: number;
  
  // Timers
  idleTimer: NodeJS.Timeout | null;       // No audio for 30s → auto-stop
  maxDurationTimer: NodeJS.Timeout | null; // 120s hard limit → force stop
  drainTimer: NodeJS.Timeout | null;       // 5s after stream end → abort
}
```

---

## 3. Production-Hardened Implementation

### 3.1 AudioWorklet Processor with Ring Buffer

```javascript
// public/audio-worklet-processor.js

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Ring buffer: accumulate samples before sending
    this.buffer = new Float32Array(4096); // ~256ms at 16kHz, ~85ms at 48kHz
    this.writeIndex = 0;
    this.targetSampleRate = 16000;
    this.active = true;
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.active = false;
        // Flush remaining buffer
        if (this.writeIndex > 0) {
          const remaining = this.buffer.slice(0, this.writeIndex);
          this.port.postMessage({ type: 'audio', samples: remaining });
          this.writeIndex = 0;
        }
        this.port.postMessage({ type: 'done' });
      }
      if (event.data.type === 'config') {
        this.targetSampleRate = event.data.targetSampleRate || 16000;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.active) return false; // Stop processing

    const input = inputs[0]?.[0]; // Mono channel 0
    if (!input || input.length === 0) return true;

    // Append to ring buffer
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.writeIndex++] = input[i];
      
      if (this.writeIndex >= this.buffer.length) {
        // Buffer full — send chunk
        // Clone before sending (transferable would be faster but complicates reuse)
        const chunk = new Float32Array(this.buffer);
        this.port.postMessage({ type: 'audio', samples: chunk });
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
```

### 3.2 Client-Side: Resampling + Chunking

```typescript
// web/src/components/speaking/audio-utils.ts

/**
 * Resample Float32 audio from sourceSampleRate to targetSampleRate.
 * Linear interpolation — good enough for speech at 16kHz target.
 */
export function resample(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) return input;

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
    const frac = srcIndex - srcIndexFloor;
    output[i] = input[srcIndexFloor] * (1 - frac) + input[srcIndexCeil] * frac;
  }

  return output;
}

/**
 * Convert Float32 [-1, 1] to PCM16 Int16Array.
 * Clamps values to prevent overflow.
 */
export function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm16;
}

/**
 * Detect if a chunk is silence (RMS below threshold).
 * Returns true if the chunk is effectively silent.
 */
export function isSilent(
  samples: Float32Array,
  threshold: number = 0.01,
): boolean {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return rms < threshold;
}
```

### 3.3 Client-Side: useTranscribeSocket Hook (Redesigned)

```typescript
// web/src/components/speaking/useTranscribeSocket.ts

import { useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { resample, float32ToPcm16, isSilent } from './audio-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const MAX_RECORDING_DURATION_MS = 120_000; // 2 minutes
const MAX_SILENCE_DURATION_MS = 15_000;    // 15s silence → auto-stop
const RECONNECT_MAX_ATTEMPTS = 3;
const RECONNECT_BUFFER_MAX_CHUNKS = 50;    // ~12.5s of audio at 250ms chunks
const TARGET_SAMPLE_RATE = 16000;

interface UseTranscribeSocketOptions {
  attemptId: string;
  questionId: string;
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (fullText: string) => void;
  onStateChange: (state: RecordingState) => void;
  onError: (error: string) => void;
}

interface UseTranscribeSocketReturn {
  start: () => Promise<void>;
  stop: () => void;
  isConnected: boolean;
  isStreaming: boolean;
}

export function useTranscribeSocket(
  opts: UseTranscribeSocketOptions,
): UseTranscribeSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stateRef = useRef<RecordingState>('idle');
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const maxDurationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectBufferRef = useRef<ArrayBuffer[]>([]);

  // --- Socket lifecycle ---
  const ensureSocket = useCallback((): Socket => {
    if (socketRef.current?.connected) return socketRef.current;

    const socket = io(`${API_URL}/transcribe`, {
      auth: { token: getAccessToken() }, // From auth store
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: RECONNECT_MAX_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      // If we were recording and reconnected, resume session
      if (stateRef.current === 'disconnected' && sessionIdRef.current) {
        socket.emit('transcribe:resume', {
          sessionId: sessionIdRef.current,
          attemptId: opts.attemptId,
          questionId: opts.questionId,
        });
        opts.onStateChange('reconnecting');
      }
    });

    socket.on('disconnect', (reason) => {
      if (stateRef.current === 'recording') {
        stateRef.current = 'disconnected';
        opts.onStateChange('disconnected');
        // Start buffering audio chunks locally
        reconnectBufferRef.current = [];
      }
    });

    socket.on('transcribe:ready', (data: { sessionId: string }) => {
      sessionIdRef.current = data.sessionId;
      stateRef.current = 'recording';
      opts.onStateChange('recording');
      // Flush any buffered chunks from reconnect
      flushReconnectBuffer(socket);
    });

    socket.on('transcribe:resumed', () => {
      stateRef.current = 'recording';
      opts.onStateChange('recording');
      flushReconnectBuffer(socket);
    });

    socket.on('transcribe:partial', (data: { text: string }) => {
      opts.onPartialTranscript(data.text);
    });

    socket.on('transcribe:final', (data: { text: string }) => {
      opts.onFinalTranscript(data.text);
    });

    socket.on('transcribe:error', (data: { message: string }) => {
      opts.onError(data.message);
      stateRef.current = 'error';
      opts.onStateChange('error');
    });

    socket.on('reconnect_failed', () => {
      // Max reconnect attempts exceeded — fallback
      stateRef.current = 'fallback';
      opts.onStateChange('fallback');
      cleanup();
    });

    socketRef.current = socket;
    return socket;
  }, [opts]);

  const flushReconnectBuffer = (socket: Socket) => {
    const buffer = reconnectBufferRef.current;
    for (const chunk of buffer) {
      socket.emit('transcribe:audio', { chunk });
    }
    reconnectBufferRef.current = [];
  };

  // --- Audio pipeline ---
  const start = useCallback(async () => {
    stateRef.current = 'connecting';
    opts.onStateChange('connecting');

    // 1. Get mic permission
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE, // Hint only
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;
    } catch (err) {
      stateRef.current = 'permission_denied';
      opts.onStateChange('permission_denied');
      return;
    }

    // 2. Create AudioContext — read actual sample rate
    const audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    audioContextRef.current = audioCtx;
    const actualSampleRate = audioCtx.sampleRate;
    const needsResampling = actualSampleRate !== TARGET_SAMPLE_RATE;

    // 3. Load AudioWorklet
    await audioCtx.audioWorklet.addModule('/audio-worklet-processor.js');
    const workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');
    workletNodeRef.current = workletNode;

    // 4. AnalyserNode for waveform
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // 5. Connect: mic → analyser → worklet
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.connect(workletNode);
    workletNode.connect(audioCtx.destination); // Required to keep pipeline alive

    // 6. Connect socket
    const socket = ensureSocket();

    // 7. Handle audio chunks from worklet
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        let samples: Float32Array = event.data.samples;

        // Resample if needed
        if (needsResampling) {
          samples = resample(samples, actualSampleRate, TARGET_SAMPLE_RATE);
        }

        // Silence detection
        if (isSilent(samples)) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > MAX_SILENCE_DURATION_MS) {
            stop(); // Auto-stop on prolonged silence
            return;
          }
        } else {
          silenceStartRef.current = null;
        }

        // Convert to PCM16
        const pcm16 = float32ToPcm16(samples);

        // Send or buffer
        if (socket.connected && stateRef.current === 'recording') {
          socket.emit('transcribe:audio', { chunk: pcm16.buffer });
        } else if (stateRef.current === 'disconnected') {
          // Buffer during disconnect (capped)
          if (reconnectBufferRef.current.length < RECONNECT_BUFFER_MAX_CHUNKS) {
            reconnectBufferRef.current.push(pcm16.buffer);
          }
          // Else: drop oldest or newest — dropping newest is simpler
        }
      }
    };

    // 8. Start transcription session
    socket.emit('transcribe:start', {
      attemptId: opts.attemptId,
      questionId: opts.questionId,
      languageCode: 'en-US',
    });

    // 9. Max duration timer
    recordingStartRef.current = Date.now();
    maxDurationTimerRef.current = setTimeout(() => {
      stop();
    }, MAX_RECORDING_DURATION_MS);

  }, [opts, ensureSocket]);

  // --- Stop ---
  const stop = useCallback(() => {
    stateRef.current = 'processing';
    opts.onStateChange('processing');

    // Signal worklet to flush and stop
    workletNodeRef.current?.port.postMessage({ type: 'stop' });

    // Tell server to drain
    socketRef.current?.emit('transcribe:stop', {
      questionId: opts.questionId,
    });

    // Clear timers
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }

    // Stop mic (release hardware)
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    // Close AudioContext
    audioContextRef.current?.close();
    audioContextRef.current = null;
    workletNodeRef.current = null;
    analyserRef.current = null;

    // Transition to done after server drain completes
    // Server will emit 'transcribe:final' with complete transcript
    // Then we wait for either transcribe:final or a 5s timeout
    setTimeout(() => {
      if (stateRef.current === 'processing') {
        stateRef.current = 'done';
        opts.onStateChange('done');
      }
    }, 5000);
  }, [opts]);

  // --- Cleanup on unmount ---
  const cleanup = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();
    socketRef.current?.disconnect();
    if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    workletNodeRef.current = null;
    socketRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    start,
    stop,
    isConnected: socketRef.current?.connected ?? false,
    isStreaming: stateRef.current === 'recording',
  };
}
```

### 3.4 Client-Side: Transcript Manager

The key insight: **never mutate the textarea while the user is editing it**.

```typescript
// web/src/components/speaking/useTranscriptManager.ts

import { useState, useCallback, useRef } from 'react';

interface TranscriptManager {
  /** Full display text (confirmed + partial) */
  displayText: string;
  /** Whether the user is manually editing */
  isEditing: boolean;
  /** Called when a final segment arrives from STT */
  appendFinal: (fullText: string) => void;
  /** Called when a partial result arrives */
  updatePartial: (text: string) => void;
  /** Called when user manually edits the textarea */
  handleUserEdit: (text: string) => void;
  /** Enter edit mode */
  startEditing: () => void;
  /** Exit edit mode, returns the final text */
  finishEditing: () => string;
  /** Clear everything for re-record */
  clear: () => void;
  /** Get the canonical answer text (for autosave) */
  getAnswerText: () => string;
}

export function useTranscriptManager(
  onAnswer: (text: string) => void,
): TranscriptManager {
  const [confirmedText, setConfirmedText] = useState('');
  const [partialText, setPartialText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  
  // Lock: if user is editing, don't clobber their work
  const isEditingRef = useRef(false);

  const appendFinal = useCallback((fullText: string) => {
    if (isEditingRef.current) return; // Don't mutate during edit
    setConfirmedText(fullText);
    setPartialText('');
    onAnswer(fullText);
  }, [onAnswer]);

  const updatePartial = useCallback((text: string) => {
    if (isEditingRef.current) return;
    setPartialText(text);
  }, []);

  const handleUserEdit = useCallback((text: string) => {
    setEditedText(text);
    onAnswer(text);
  }, [onAnswer]);

  const startEditing = useCallback(() => {
    isEditingRef.current = true;
    setIsEditing(true);
    // Snapshot current state into editable text
    setEditedText(confirmedText + (partialText ? ' ' + partialText : ''));
  }, [confirmedText, partialText]);

  const finishEditing = useCallback(() => {
    isEditingRef.current = false;
    setIsEditing(false);
    setConfirmedText(editedText);
    setPartialText('');
    onAnswer(editedText);
    return editedText;
  }, [editedText, onAnswer]);

  const clear = useCallback(() => {
    setConfirmedText('');
    setPartialText('');
    setEditedText('');
    isEditingRef.current = false;
    setIsEditing(false);
    onAnswer('');
  }, [onAnswer]);

  const getAnswerText = useCallback(() => {
    if (isEditingRef.current) return editedText;
    return confirmedText;
  }, [editedText, confirmedText]);

  const displayText = isEditing
    ? editedText
    : confirmedText + (partialText ? ' ' + partialText : '');

  return {
    displayText,
    isEditing,
    appendFinal,
    updatePartial,
    handleUserEdit,
    startEditing,
    finishEditing,
    clear,
    getAnswerText,
  };
}
```

### 3.5 Server-Side: TranscribeService (Hardened)

```typescript
// api/src/transcribe/transcribe.service.ts

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming';
import { PassThrough } from 'stream';
import { randomUUID } from 'crypto';

const MAX_SESSION_DURATION_MS = 130_000;    // 2min + 10s buffer
const IDLE_TIMEOUT_MS = 30_000;             // 30s no audio → auto-stop
const DRAIN_TIMEOUT_MS = 5_000;             // 5s after stream end
const MAX_CHUNK_SIZE = 32_000;              // 32KB max per chunk
const MAX_CHUNKS_PER_SECOND = 10;           // Rate limit
const MAX_TOTAL_BYTES = 5_000_000;          // ~5MB max per session

interface TranscribeSession {
  sessionId: string;
  userId: string;
  attemptId: string;
  questionId: string;
  socketId: string;
  state: 'initializing' | 'streaming' | 'draining' | 'closed' | 'error';
  audioStream: PassThrough;
  abortController: AbortController;
  confirmedSegments: string[];
  createdAt: number;
  lastAudioAt: number;
  totalBytesReceived: number;
  chunkCount: number;
  chunkTimestamps: number[];  // For rate limiting (sliding window)
  idleTimer: NodeJS.Timeout | null;
  maxDurationTimer: NodeJS.Timeout | null;
  drainTimer: NodeJS.Timeout | null;
}

// Callbacks for gateway communication
interface SessionCallbacks {
  onPartial: (text: string) => void;
  onFinal: (fullText: string) => void;
  onError: (error: Error) => void;
  onAutoStop: (reason: string) => void;
}

@Injectable()
export class TranscribeService implements OnModuleDestroy {
  private readonly logger = new Logger(TranscribeService.name);
  private readonly client: TranscribeStreamingClient;

  // Primary index: sessionId → session
  private readonly sessions = new Map<string, TranscribeSession>();
  // Secondary index: socketId:questionId → sessionId (for routing audio)
  private readonly socketIndex = new Map<string, string>();
  // Callbacks stored separately (not serializable)
  private readonly callbacks = new Map<string, SessionCallbacks>();

  constructor() {
    this.client = new TranscribeStreamingClient({
      region: process.env.AWS_TRANSCRIBE_REGION || process.env.AWS_REGION || 'us-east-1',
    });
  }

  onModuleDestroy() {
    // Graceful shutdown: abort all sessions
    for (const [sessionId, session] of this.sessions) {
      this.destroySession(sessionId, 'server_shutdown');
    }
  }

  /**
   * Start a new transcription session.
   * Returns a sessionId that survives socket reconnections.
   */
  async startSession(
    userId: string,
    attemptId: string,
    questionId: string,
    socketId: string,
    languageCode: string,
    callbacks: SessionCallbacks,
  ): Promise<string> {
    // Prevent duplicate sessions per user+question
    const existingId = this.findSessionByUserAndQuestion(userId, questionId);
    if (existingId) {
      await this.destroySession(existingId, 'replaced');
    }

    const sessionId = randomUUID();
    const audioStream = new PassThrough({ highWaterMark: 32 * 1024 }); // 32KB buffer
    const abortController = new AbortController();

    const session: TranscribeSession = {
      sessionId,
      userId,
      attemptId,
      questionId,
      socketId,
      state: 'initializing',
      audioStream,
      abortController,
      confirmedSegments: [],
      createdAt: Date.now(),
      lastAudioAt: Date.now(),
      totalBytesReceived: 0,
      chunkCount: 0,
      chunkTimestamps: [],
      idleTimer: null,
      maxDurationTimer: null,
      drainTimer: null,
    };

    this.sessions.set(sessionId, session);
    this.socketIndex.set(`${socketId}:${questionId}`, sessionId);
    this.callbacks.set(sessionId, callbacks);

    // Max duration timer
    session.maxDurationTimer = setTimeout(() => {
      this.logger.warn(`Session ${sessionId} hit max duration`);
      callbacks.onAutoStop('max_duration');
      this.stopSession(sessionId);
    }, MAX_SESSION_DURATION_MS);

    // Idle timer
    this.resetIdleTimer(session, callbacks);

    // Start AWS Transcribe stream (async, don't await — runs in background)
    this.runTranscribeStream(session, languageCode, callbacks).catch((err) => {
      this.logger.error(`Transcribe stream failed [${sessionId}]:`, err);
      callbacks.onError(err);
      this.destroySession(sessionId, 'aws_error');
    });

    session.state = 'streaming';
    return sessionId;
  }

  /**
   * Resume a session after socket reconnect.
   * Re-maps the socketId and returns the current transcript.
   */
  resumeSession(
    sessionId: string,
    userId: string,
    newSocketId: string,
    callbacks: SessionCallbacks,
  ): { success: boolean; transcript: string } {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      return { success: false, transcript: '' };
    }
    if (session.state !== 'streaming') {
      return { success: false, transcript: this.getTranscript(sessionId) };
    }

    // Update socket mapping
    this.socketIndex.delete(`${session.socketId}:${session.questionId}`);
    session.socketId = newSocketId;
    this.socketIndex.set(`${newSocketId}:${session.questionId}`, sessionId);
    this.callbacks.set(sessionId, callbacks);

    return { success: true, transcript: this.getTranscript(sessionId) };
  }

  /**
   * Feed an audio chunk. Returns false if rejected (rate limit, size, etc).
   */
  feedAudio(sessionId: string, chunk: Buffer): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'streaming') return false;

    // Size check
    if (chunk.length > MAX_CHUNK_SIZE) {
      this.logger.warn(`Chunk too large [${sessionId}]: ${chunk.length} bytes`);
      return false;
    }

    // Total bytes check
    if (session.totalBytesReceived + chunk.length > MAX_TOTAL_BYTES) {
      this.logger.warn(`Session ${sessionId} exceeded max total bytes`);
      const callbacks = this.callbacks.get(sessionId);
      callbacks?.onAutoStop('max_bytes');
      this.stopSession(sessionId);
      return false;
    }

    // Rate limiting: max N chunks per second (sliding window)
    const now = Date.now();
    session.chunkTimestamps = session.chunkTimestamps.filter((t) => now - t < 1000);
    if (session.chunkTimestamps.length >= MAX_CHUNKS_PER_SECOND) {
      // Drop this chunk silently (too fast)
      return false;
    }
    session.chunkTimestamps.push(now);

    // Backpressure: check if PassThrough is draining
    const canWrite = session.audioStream.write(chunk);
    if (!canWrite) {
      // Buffer is full — wait for drain. 
      // For real-time audio, dropping is better than buffering.
      this.logger.debug(`Backpressure on session ${sessionId}, chunk dropped`);
      return false;
    }

    session.totalBytesReceived += chunk.length;
    session.chunkCount++;
    session.lastAudioAt = now;

    // Reset idle timer
    const callbacks = this.callbacks.get(sessionId);
    if (callbacks) this.resetIdleTimer(session, callbacks);

    return true;
  }

  /**
   * Gracefully stop a session. Drains remaining results from AWS.
   */
  async stopSession(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) return '';
    if (session.state === 'draining' || session.state === 'closed') {
      return this.getTranscript(sessionId);
    }

    session.state = 'draining';
    session.audioStream.end(); // Signal end of audio to AWS

    // Clear timers
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.maxDurationTimer) clearTimeout(session.maxDurationTimer);

    // Wait for drain, then force-close
    return new Promise((resolve) => {
      session.drainTimer = setTimeout(() => {
        const transcript = this.getTranscript(sessionId);
        this.destroySession(sessionId, 'drain_complete');
        resolve(transcript);
      }, DRAIN_TIMEOUT_MS);
    });
  }

  /**
   * Forcefully destroy a session and release all resources.
   */
  private destroySession(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.logger.debug(`Destroying session ${sessionId}: ${reason}`);

    // Clear all timers
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (session.maxDurationTimer) clearTimeout(session.maxDurationTimer);
    if (session.drainTimer) clearTimeout(session.drainTimer);

    // Abort AWS stream
    session.abortController.abort();

    // End audio stream if not already ended
    if (!session.audioStream.destroyed) {
      session.audioStream.destroy();
    }

    session.state = 'closed';

    // Clean up indexes
    this.socketIndex.delete(`${session.socketId}:${session.questionId}`);
    this.sessions.delete(sessionId);
    this.callbacks.delete(sessionId);
  }

  /**
   * Clean up all sessions for a disconnected socket.
   * Called by the gateway's handleDisconnect.
   * 
   * NOTE: We do NOT immediately destroy sessions on disconnect.
   * We give the client time to reconnect (handled by resumeSession).
   * If they don't reconnect within IDLE_TIMEOUT, the idle timer kills it.
   */
  handleSocketDisconnect(socketId: string): void {
    // Just remove socket index entries — sessions stay alive for reconnect
    for (const [key, sessId] of this.socketIndex) {
      if (key.startsWith(`${socketId}:`)) {
        this.socketIndex.delete(key);
      }
    }
  }

  /** Get accumulated transcript */
  getTranscript(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';
    return session.confirmedSegments.join(' ');
  }

  /** Find session by socketId:questionId */
  findSessionBySocket(socketId: string, questionId: string): string | null {
    return this.socketIndex.get(`${socketId}:${questionId}`) ?? null;
  }

  private findSessionByUserAndQuestion(userId: string, questionId: string): string | null {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.questionId === questionId) return id;
    }
    return null;
  }

  private resetIdleTimer(session: TranscribeSession, callbacks: SessionCallbacks): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      this.logger.debug(`Session ${session.sessionId} idle timeout`);
      callbacks.onAutoStop('idle_timeout');
      this.stopSession(session.sessionId);
    }, IDLE_TIMEOUT_MS);
  }

  private async runTranscribeStream(
    session: TranscribeSession,
    languageCode: string,
    callbacks: SessionCallbacks,
  ): Promise<void> {
    const audioStreamGenerator = async function* () {
      for await (const chunk of session.audioStream) {
        yield { AudioEvent: { AudioChunk: chunk as Buffer } };
      }
    };

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: languageCode,
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: TARGET_SAMPLE_RATE,
      AudioStream: audioStreamGenerator(),
      EnablePartialResultsStabilization: true,
      PartialResultsStability: 'medium',
    });

    const response = await this.client.send(command, {
      abortSignal: session.abortController.signal,
    });

    if (response.TranscriptResultStream) {
      for await (const event of response.TranscriptResultStream) {
        // Check if session still exists (may have been destroyed)
        if (!this.sessions.has(session.sessionId)) break;

        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            const text = result.Alternatives?.[0]?.Transcript || '';
            if (!text) continue;

            if (result.IsPartial) {
              callbacks.onPartial(text);
            } else {
              session.confirmedSegments.push(text);
              const fullTranscript = session.confirmedSegments.join(' ');
              callbacks.onFinal(fullTranscript);
            }
          }
        }
      }
    }
  }
}

const TARGET_SAMPLE_RATE = 16000;
```

### 3.6 Server-Side: TranscribeGateway (Hardened)

```typescript
// api/src/transcribe/transcribe.gateway.ts

import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { TranscribeService } from './transcribe.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  namespace: '/transcribe',
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
export class TranscribeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TranscribeGateway.name);

  constructor(
    private transcribeService: TranscribeService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Validate JWT (same as ChatGateway pattern)
      const userId = await this.validateAuth(client);
      if (!userId) {
        client.disconnect(true);
        return;
      }
      client.data.userId = userId;
      this.logger.debug(`Transcribe client connected: ${client.id} (user: ${userId})`);
    } catch (err) {
      this.logger.warn(`Auth failed for socket ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Transcribe client disconnected: ${client.id}`);
    // Don't destroy sessions — allow reconnect within idle timeout
    this.transcribeService.handleSocketDisconnect(client.id);
  }

  @SubscribeMessage('transcribe:start')
  async handleStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { attemptId: string; questionId: string; languageCode?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    // Validate ownership: does this user own this attempt?
    const attempt = await this.prisma.userAttempt.findFirst({
      where: {
        id: data.attemptId,
        userId,
        status: 'IN_PROGRESS',
      },
    });
    if (!attempt) {
      client.emit('transcribe:error', {
        message: 'Invalid or unauthorized attempt',
        questionId: data.questionId,
      });
      return;
    }

    try {
      const sessionId = await this.transcribeService.startSession(
        userId,
        data.attemptId,
        data.questionId,
        client.id,
        data.languageCode || 'en-US',
        {
          onPartial: (text) => {
            client.emit('transcribe:partial', { text, questionId: data.questionId });
          },
          onFinal: (text) => {
            client.emit('transcribe:final', { text, questionId: data.questionId });
          },
          onError: (err) => {
            client.emit('transcribe:error', { message: err.message, questionId: data.questionId });
          },
          onAutoStop: (reason) => {
            client.emit('transcribe:auto-stop', { reason, questionId: data.questionId });
          },
        },
      );

      client.emit('transcribe:ready', { sessionId, questionId: data.questionId });
    } catch (err) {
      this.logger.error(`Failed to start session: ${err}`);
      client.emit('transcribe:error', {
        message: 'Failed to start transcription',
        questionId: data.questionId,
      });
    }
  }

  @SubscribeMessage('transcribe:resume')
  async handleResume(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; attemptId: string; questionId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    const result = this.transcribeService.resumeSession(
      data.sessionId,
      userId,
      client.id,
      {
        onPartial: (text) => {
          client.emit('transcribe:partial', { text, questionId: data.questionId });
        },
        onFinal: (text) => {
          client.emit('transcribe:final', { text, questionId: data.questionId });
        },
        onError: (err) => {
          client.emit('transcribe:error', { message: err.message, questionId: data.questionId });
        },
        onAutoStop: (reason) => {
          client.emit('transcribe:auto-stop', { reason, questionId: data.questionId });
        },
      },
    );

    if (result.success) {
      client.emit('transcribe:resumed', {
        sessionId: data.sessionId,
        questionId: data.questionId,
        transcript: result.transcript,
      });
    } else {
      // Session expired or invalid — client should start fresh
      client.emit('transcribe:error', {
        message: 'Session expired, please re-record',
        questionId: data.questionId,
      });
    }
  }

  @SubscribeMessage('transcribe:audio')
  handleAudio(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chunk: ArrayBuffer; questionId?: string },
  ) {
    if (!client.data.userId) return;

    // Find session for this socket
    // questionId is optional — if only one session per socket, find it
    const questionId = data.questionId;
    if (!questionId) return;

    const sessionId = this.transcribeService.findSessionBySocket(client.id, questionId);
    if (!sessionId) return; // No active session — drop silently

    // Audio is already PCM16 from the client (browser-side AudioWorklet)
    const pcmBuffer = Buffer.from(data.chunk);
    this.transcribeService.feedAudio(sessionId, pcmBuffer);
  }

  @SubscribeMessage('transcribe:stop')
  async handleStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { questionId: string },
  ) {
    if (!client.data.userId) return;

    const sessionId = this.transcribeService.findSessionBySocket(client.id, data.questionId);
    if (!sessionId) return;

    const finalTranscript = await this.transcribeService.stopSession(sessionId);
    client.emit('transcribe:final', { text: finalTranscript, questionId: data.questionId });
    client.emit('transcribe:stopped', { questionId: data.questionId });
  }

  private async validateAuth(client: Socket): Promise<string | null> {
    // Extract JWT from handshake auth or cookies
    // Validate with Cognito JWKS (same pattern as ChatGateway)
    // Return userId or null
    const token = client.handshake.auth?.token
      || this.extractTokenFromCookies(client.handshake.headers.cookie);
    if (!token) return null;

    // ... JWT validation (reuse existing auth pattern) ...
    return null; // Placeholder
  }

  private extractTokenFromCookies(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/access_token=([^;]+)/);
    return match ? match[1] : null;
  }
}
```

---

## 4. Performance & Cost Optimizations

### 4.1 Silence Detection (Client-Side)

Already included in the redesigned hook (Section 3.3). Key parameters:

```
RMS threshold:     0.01 (adjustable; test with real mic noise floors)
Silence duration:  15 seconds → auto-stop
```

**Impact:** A user who forgets to click Stop after speaking only costs 15s of extra streaming instead of minutes.

**Cost savings at scale:**
- Without: 60s avg recording = $0.024/session
- With silence detection: 30s avg = $0.012/session
- At 10,000 sessions/day: $120 savings/day

### 4.2 Maximum Duration Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Client-side timer | 120s | Matches longest TOEIC speaking task (60s) + buffer |
| Server-side timer | 130s | 10s buffer over client for network delays |
| Total bytes | 5MB | ~160s at 16kHz mono PCM16 (32KB/s) |
| Chunks/second | 10 | Prevents flood; 4 chunks/s is normal at 250ms |

### 4.3 Chunk Batching Strategy

The AudioWorklet sends ~4096 samples per message (256ms at 16kHz). This is a good balance:

| Chunk interval | Latency added | WS overhead | Recommendation |
|---------------|---------------|-------------|----------------|
| 64ms (1024 samples) | Low | High (15 msgs/s) | Too chatty |
| 128ms (2048 samples) | Low | Moderate (8 msgs/s) | Acceptable |
| **256ms (4096 samples)** | **Medium** | **Low (4 msgs/s)** | **Recommended** |
| 500ms (8000 samples) | High | Very low (2 msgs/s) | Too laggy for real-time |

At 256ms chunks: 4096 samples * 2 bytes = 8KB per chunk, 32KB/s bandwidth.

### 4.4 Partial Result Stabilization

AWS Transcribe supports `PartialResultsStability`:
- `high`: Fewer revisions to partial results, but slower
- `medium`: Balanced (recommended)
- `low`: Fastest partials but they change frequently (distracting UX)

Use `medium` — partials are display-only, so minor revisions are acceptable.

### 4.5 Conditional Transcription

Not all speaking question types need real-time STT with equal urgency:

| Type | Real-time STT value | Recommendation |
|------|---------------------|----------------|
| READ_ALOUD | High (student sees their accuracy vs original) | Always stream |
| DESCRIBE_PICTURE | High (sees their description forming) | Always stream |
| RESPOND_TO_QUESTIONS | Medium (short answers, 15-30s) | Stream but could batch |
| PROPOSE_SOLUTION | Medium | Stream |
| EXPRESS_OPINION | High (long-form, 60s) | Always stream |

---

## 5. Scaling Strategy

### 5.1 WebSocket Server Architecture

**Problem:** Each transcription session holds an open WebSocket + an open AWS Transcribe stream. Both are stateful.

**Solution: Sticky sessions with horizontal scaling.**

```
                    ┌─────────────────────┐
                    │   ALB / NLB         │
                    │ (sticky sessions    │
                    │  by socket.io sid)  │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
        │ NestJS #1  │  │ NestJS #2  │  │ NestJS #3  │
        │ WS + Trans │  │ WS + Trans │  │ WS + Trans │
        │ sessions   │  │ sessions   │  │ sessions   │
        └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                    ┌─────────▼───────────┐
                    │   Redis             │
                    │ (Socket.io adapter  │
                    │  + session metadata)│
                    └─────────────────────┘
```

**Why sticky sessions are necessary:** The `sessions` Map is in-memory. A `transcribe:audio` event MUST hit the same instance that holds the AWS Transcribe stream for that session.

**ALB configuration:**
- Stickiness: application-based cookie (`io` cookie from Socket.io)
- Health check: HTTP `/health` endpoint
- Connection draining: 130s (max session duration)

### 5.2 Capacity Planning

Per-instance capacity:

| Resource | Per Session | Per Instance (1000 sessions) |
|----------|-----------|------------------------------|
| Memory (session state) | ~50KB | ~50MB |
| CPU (audio forwarding) | ~0.1% | ~100% of 1 core |
| Network in (audio) | 32KB/s | 32MB/s |
| Network out (transcripts) | ~1KB/s | ~1MB/s |
| AWS Transcribe streams | 1 | 1000 |

**AWS Transcribe limits:**
- Default: 25 concurrent streams per region per account
- Can be increased to **200** via support ticket
- For 1000+ concurrent: use multiple AWS regions or accounts

**Recommendation for 1000 concurrent users:**
- 3 NestJS instances (350 sessions each, headroom for spikes)
- Request AWS Transcribe limit increase to 500 streams
- Monitor `ActiveStreamCount` CloudWatch metric

### 5.3 When to Introduce Worker Services

**For MVP (< 100 concurrent):** Everything in the NestJS process. Simple.

**At scale (100-1000 concurrent):** Still viable in-process with horizontal scaling (Section 5.1).

**At large scale (1000+ concurrent):** Consider extracting transcription to a dedicated microservice:

```
NestJS API (stateless)          Transcribe Worker (stateful)
┌─────────────┐                 ┌──────────────────┐
│ WS Gateway  │──── Redis ──────│ Session Manager   │
│ (auth only) │  pubsub/queue   │ AWS Transcribe    │
└─────────────┘                 │ streams           │
                                └──────────────────┘
```

**But don't do this prematurely.** The in-process approach handles 1000 concurrent sessions on 3-5 instances. A microservice adds complexity (Redis-based audio streaming, session migration) that isn't worth it below that threshold.

### 5.4 Session Metadata in Redis (Optional, for Multi-Instance)

If you need to route `transcribe:resume` to the correct instance after reconnect:

```typescript
// Store session → instance mapping in Redis
await redis.hset(`transcribe:session:${sessionId}`, {
  instanceId: INSTANCE_ID,
  userId,
  questionId,
  createdAt: Date.now(),
});
await redis.expire(`transcribe:session:${sessionId}`, 300); // 5min TTL
```

Socket.io's Redis adapter already handles event fanout. The session metadata helps route resume requests to the correct instance.

---

## 6. UX Considerations

### 6.1 Connection Loss Communication

```
State Machine State → UX Display

idle                → "Click Record to start speaking"
connecting          → "Connecting..." (spinner)
permission_request  → Browser's native mic permission dialog
permission_denied   → "Microphone access denied. You can type your response instead."
                      [Type Response] button
recording           → Red pulsing dot + "Recording 00:15" + waveform
disconnected        → Yellow banner: "Connection lost. Reconnecting..."
                      Audio continues buffering locally
reconnecting        → Yellow banner: "Reconnecting... (attempt 2/3)"
                      Note: "Your recording is being preserved"
fallback            → Orange banner: "Connection lost. Please type your response."
                      Textarea with whatever transcript we captured
processing          → "Processing final results..." (2-3s)
done                → "Recording complete. Review your transcript below."
                      [Edit] [Re-record] buttons
error               → Red banner: "Transcription error: {message}"
                      Textarea fallback
```

### 6.2 Preventing Transcript Corruption During Editing

The `useTranscriptManager` (Section 3.4) solves this with a clear protocol:

1. **While recording:** Transcript display is read-only. STT appends freely.
2. **After recording (done state):** User sees an "Edit Transcript" button.
3. **Edit mode:** STT updates are ignored. User has full control.
4. **Save:** User clicks "Done Editing" or it auto-saves.

**Critical rule:** The `onAnswer` callback is only called with the authoritative text:
- During recording: from STT final results
- During editing: from user's textarea

Never both simultaneously.

### 6.3 Auto-Save Interaction

The existing 5s auto-save reads from `answers[questionId]`. The transcript manager ensures this is always the correct, non-corrupted value:

```typescript
// In SpeakingRecorder component:
const transcriptManager = useTranscriptManager((text) => {
  onAnswer(questionId, text); // Updates answers[questionId]
});

// Auto-save in parent reads answers[questionId] — always consistent
```

### 6.4 Fallback: Full Audio Recording

As a safety net, **always** record the full audio via MediaRecorder in parallel:

```typescript
// In SpeakingRecorder, alongside AudioWorklet:
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
});
const audioChunks: Blob[] = [];
mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
mediaRecorder.start();

// On stop:
mediaRecorder.stop();
mediaRecorder.onstop = () => {
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  // Store locally (IndexedDB) or upload to S3 (Phase 2)
  // This audio can be batch-transcribed if real-time STT failed
};
```

**Phase 1:** Store in IndexedDB as backup. If STT produced garbage, user types manually.
**Phase 2:** Upload to S3 for review, batch re-transcription, pronunciation scoring.

---

## 7. Implementation Checklist (Prioritized)

### Must-Have (MVP)

- [ ] Client state machine (Section 2.2)
- [ ] Sample rate detection + resampling (Section 3.2)
- [ ] AudioWorklet with ring buffer (Section 3.1)
- [ ] Transcript manager with edit locking (Section 3.4)
- [ ] Server session lifecycle with timeouts (Section 3.5)
- [ ] Auth validation on `transcribe:start` (Section 3.6)
- [ ] Max duration + silence detection (Section 4.1, 4.2)
- [ ] Resource cleanup on unmount (all refs properly cleared)
- [ ] Graceful fallback to textarea

### Should-Have (Production)

- [ ] Rate limiting on audio events (Section 3.5)
- [ ] Backpressure handling (Section 3.5)
- [ ] Reconnect + resume protocol (Sections 3.3, 3.5, 3.6)
- [ ] Parallel MediaRecorder backup (Section 6.4)
- [ ] Server `onModuleDestroy` cleanup
- [ ] CloudWatch metrics: active sessions, transcription latency, error rate

### Nice-to-Have (Scale)

- [ ] Sticky session ALB configuration (Section 5.1)
- [ ] Redis session metadata (Section 5.4)
- [ ] Per-question-type chunk batching (Section 4.5)
- [ ] S3 audio upload for Phase 2 review
- [ ] Batch transcription fallback for failed real-time sessions
