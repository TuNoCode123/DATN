import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  type LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { CreditReason } from '@prisma/client';
import { CreditsService } from '../credits/credits.service';
import { AlbJwtService } from '../auth/alb-jwt.service';
import { AlbUserService } from '../auth/alb-user.service';
import { BedrockService } from '../bedrock/bedrock.service';
import { PrismaService } from '../prisma/prisma.service';
import { StableTokenTracker } from './stable-token-tracker';
import { alignWords, scoreWords, gradeSpeakingOpenEnded } from './scoring-engine';
import { PartialSnapshot, TranscribeWord } from './types';
import { PassThrough } from 'stream';
import * as zlib from 'zlib';

const READ_ALOUD = 'READ_ALOUD';

interface SpeakingSession {
  audioStream: PassThrough;
  userId: string;
  questionId: string;
  attemptId: string;
  targetText: string;
  questionType: string;
  questionStem: string | null;
  tracker: StableTokenTracker;
  startedAt: number;
  snapshotCounter: number;
  accumulatedText: string;
  abortController: AbortController;
  backpressureQueue: Buffer[];
  draining: boolean;
}

@WebSocketGateway({
  namespace: '/speaking',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  perMessageDeflate: { threshold: 256 },
  maxHttpBufferSize: 64 * 1024,
})
export class SpeakingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('SpeakingGateway');
  private sessions: Map<string, SpeakingSession> = new Map();
  private transcribeClient: TranscribeStreamingClient;

  constructor(
    private config: ConfigService,
    private credits: CreditsService,
    private albJwtService: AlbJwtService,
    private albUserService: AlbUserService,
    private bedrock: BedrockService,
    private prisma: PrismaService,
  ) {
    const region =
      this.config.get<string>('AWS_TRANSCRIBE_REGION') ||
      this.config.get<string>('AWS_REGION', 'ap-southeast-2');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.config.get<string>(
      'AWS_SECRET_ACCESS_KEY',
      '',
    );

    this.transcribeClient = new TranscribeStreamingClient({
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async handleConnection(socket: Socket) {
    try {
      const user = await this.authenticateSocket(socket);
      socket.data.user = user;
      this.logger.log(`[CONNECT] user=${user.id} socket=${socket.id}`);
    } catch (err: any) {
      this.logger.warn(`[CONNECT_FAIL] ${err.message}`);
      socket.emit('error', { message: 'Authentication failed' });
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    this.cleanupSession(socket.id);
    this.logger.log(`[DISCONNECT] socket=${socket.id}`);
  }

  @SubscribeMessage('start-recording')
  async handleStartRecording(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      questionId: string;
      attemptId: string;
      targetText?: string;
      questionType?: string;
      questionStem?: string;
    },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    this.cleanupSession(socket.id);

    const audioStream = new PassThrough({ highWaterMark: 32 * 1024 });
    const abortController = new AbortController();

    const session: SpeakingSession = {
      audioStream,
      userId,
      questionId: data.questionId,
      attemptId: data.attemptId,
      targetText: (data.targetText || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      questionType: data.questionType || '',
      questionStem: data.questionStem || null,
      tracker: new StableTokenTracker(),
      startedAt: Date.now(),
      snapshotCounter: 0,
      accumulatedText: '',
      abortController,
      backpressureQueue: [],
      draining: false,
    };

    this.sessions.set(socket.id, session);
    this.startTranscribeStream(socket, session);

    socket.emit('started', { creditsDeducted: 0 });
    this.logger.log(
      `[RECORDING_START] user=${userId} question=${data.questionId}`,
    );
  }

  @SubscribeMessage('audio-chunk')
  handleAudioChunk(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: Buffer | ArrayBuffer,
  ) {
    const session = this.sessions.get(socket.id);
    if (!session) return;

    const compressed = Buffer.isBuffer(data) ? data : Buffer.from(data);

    try {
      const pcm = zlib.inflateRawSync(compressed);
      this.writeWithBackpressure(session, pcm);
    } catch {
      this.writeWithBackpressure(session, compressed);
    }
  }

  @SubscribeMessage('stop-recording')
  async handleStopRecording(@ConnectedSocket() socket: Socket) {
    const session = this.sessions.get(socket.id);
    if (!session) return;

    // Close the audio stream to finalize transcription
    session.audioStream.end();

    // Wait for final transcription results to arrive from AWS Transcribe.
    // 500ms is too short — AWS may still be processing the last audio chunk.
    // We wait up to 3 seconds, checking every 200ms if new text has arrived.
    let lastText = session.accumulatedText;
    let stableCount = 0;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (session.accumulatedText !== lastText) {
        lastText = session.accumulatedText;
        stableCount = 0;
      } else {
        stableCount++;
        // Text hasn't changed for 600ms (3 checks) — consider it stable
        if (stableCount >= 3) break;
      }
    }

    // Use accumulatedText (final segments from AWS Transcribe) as the primary
    // spoken text. The StableTokenTracker only tracks words seen in ≥3 partial
    // snapshots, so it often misses words — especially for short recordings or
    // when Transcribe sends few partial updates before finalizing.
    const stableTokens = session.tracker.finalize();
    const accumulatedSentence = session.accumulatedText.trim();
    const stableSentence = stableTokens.map((t) => t.token).join(' ');

    // Prefer accumulatedText if it has more words (it's from final Transcribe
    // results which are more accurate than partial-based stable tracking).
    const spokenSentence =
      accumulatedSentence.split(/\s+/).length >=
      stableSentence.split(/\s+/).length
        ? accumulatedSentence
        : stableSentence;

    this.logger.log(
      `[RECORDING_STOP] socket=${socket.id} spoken="${spokenSentence.substring(0, 80)}..." ` +
        `(accumulated=${accumulatedSentence.split(/\s+/).length} words, ` +
        `stable=${stableTokens.length} tokens)`,
    );

    let assessment;

    if (session.questionType === READ_ALOUD && session.targetText) {
      // Deterministic scoring: word alignment + per-word scoring
      const spokenWords = spokenSentence.split(/\s+/).filter(Boolean);
      const targetWords = session.targetText.split(/\s+/).filter(Boolean);
      const aligned = alignWords(spokenWords, targetWords);
      assessment = scoreWords(aligned, stableTokens, session.targetText);
      // Override spokenSentence with the fuller transcript
      assessment.spokenSentence = spokenSentence;
    } else {
      // Open-ended: AI grading via Bedrock
      try {
        assessment = await gradeSpeakingOpenEnded(
          spokenSentence,
          session.questionType,
          session.questionStem,
          this.bedrock,
        );
      } catch (err: any) {
        this.logger.error(`[AI_GRADE_FAIL] ${err.message}`);
        assessment = {
          wordScores: [],
          pronunciationScore: 0,
          fluencyScore: 0,
          completenessScore: 0,
          overallScore: 0,
          spokenSentence,
          targetSentence: session.targetText,
          finalTranscript: session.accumulatedText,
          totalDuration: (Date.now() - session.startedAt) / 1000,
          pauseCount: 0,
          totalPauseTime: 0,
          autoCorrectionCount: 0,
        };
      }
    }

    assessment.finalTranscript = session.accumulatedText;

    // Save to UserAnswer
    try {
      await this.prisma.userAnswer.upsert({
        where: {
          attemptId_questionId: {
            attemptId: session.attemptId,
            questionId: session.questionId,
          },
        },
        create: {
          attemptId: session.attemptId,
          questionId: session.questionId,
          answerText: JSON.stringify({
            transcript: spokenSentence,
            assessment,
          }),
        },
        update: {
          answerText: JSON.stringify({
            transcript: spokenSentence,
            assessment,
          }),
        },
      });
    } catch (err: any) {
      this.logger.error(`[SAVE_FAIL] ${err.message}`);
    }

    socket.emit('assessment', assessment);
    this.cleanupSession(socket.id);
  }

  private writeWithBackpressure(session: SpeakingSession, chunk: Buffer) {
    const ok = session.audioStream.write(chunk);
    if (!ok && !session.draining) {
      session.draining = true;
      session.audioStream.once('drain', () => {
        session.draining = false;
        while (session.backpressureQueue.length > 0) {
          const queued = session.backpressureQueue.shift()!;
          const canContinue = session.audioStream.write(queued);
          if (!canContinue) {
            session.draining = true;
            session.audioStream.once('drain', () => {
              session.draining = false;
            });
            break;
          }
        }
      });
    } else if (!ok) {
      session.backpressureQueue.push(chunk);
    }
  }

  private async startTranscribeStream(
    socket: Socket,
    session: SpeakingSession,
  ) {
    try {
      const audioGenerator = this.createAsyncAudioGenerator(
        session.audioStream,
      );

      const response = await this.transcribeClient.send(
        new StartStreamTranscriptionCommand({
          LanguageCode: 'en-US' as LanguageCode,
          MediaEncoding: 'pcm',
          MediaSampleRateHertz: 16000,
          EnablePartialResultsStabilization: true,
          PartialResultsStability: 'medium',
          AudioStream: audioGenerator as any,
        }),
        { abortSignal: session.abortController.signal },
      );

      if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
          if (!this.sessions.has(socket.id)) break;

          const results = event.TranscriptEvent?.Transcript?.Results;
          if (!results || results.length === 0) continue;

          for (const result of results) {
            const alt = result.Alternatives?.[0];
            const text = alt?.Transcript || '';
            if (!text) continue;

            // Build words array
            const words: TranscribeWord[] = (alt?.Items || [])
              .filter((item) => item.Content)
              .map((item) => ({
                content: item.Content!,
                confidence: item.Confidence ?? 0,
                startTime: item.StartTime ?? 0,
                endTime: item.EndTime ?? 0,
                type:
                  item.Type === 'punctuation'
                    ? ('punctuation' as const)
                    : ('pronunciation' as const),
              }));

            const snapshot: PartialSnapshot = {
              resultId: result.ResultId || '',
              timestamp: Date.now(),
              isPartial: !!result.IsPartial,
              transcript: text,
              words,
              snapshotIndex: session.snapshotCounter++,
            };

            if (result.IsPartial) {
              // Feed partial to StableTokenTracker
              session.tracker.addPartial(snapshot);
              // Emit live transcript to client
              socket.emit('partial', { transcript: text });
            } else {
              // Final result — feed to tracker for auto-correction detection
              session.tracker.addFinal(snapshot);
              session.accumulatedText = session.accumulatedText
                ? session.accumulatedText + ' ' + text
                : text;
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        this.logger.error(`Transcribe error: ${err.message}`);
        socket.emit('error', { message: 'Transcription failed' });
      }
    }
  }

  private async *createAsyncAudioGenerator(stream: PassThrough) {
    for await (const chunk of stream) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  }

  private cleanupSession(socketId: string) {
    const session = this.sessions.get(socketId);
    if (!session) return;

    session.backpressureQueue.length = 0;
    session.abortController.abort();
    try {
      session.audioStream.end();
    } catch {
      // Ignore errors if already ended
    }
    this.sessions.delete(socketId);
  }

  private async authenticateSocket(
    socket: Socket,
  ): Promise<{ id: string; email: string; role: string }> {
    const albToken = socket.handshake.headers['x-amzn-oidc-data'] as string | undefined;
    const claims = await this.albJwtService.verify(albToken);
    if (!claims) throw new Error('Not authenticated');

    const user = await this.albUserService.resolveUser(claims);
    return { id: user.id, email: user.email, role: claims.role };
  }
}
