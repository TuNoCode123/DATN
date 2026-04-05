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
import { CognitoAuthService } from '../auth/cognito-auth.service';
import { PronunciationService } from './pronunciation.service';
import { PassThrough } from 'stream';
import * as zlib from 'zlib';

export interface TranscribeItem {
  content: string;
  confidence: number;
  startTime: number;
  endTime: number;
  type: 'pronunciation' | 'punctuation';
}

interface TranscribeSession {
  audioStream: PassThrough;
  userId: string;
  targetSentence: string;
  startedAt: number;
  minutesBilled: number;
  silenceTimer?: ReturnType<typeof setTimeout>;
  accumulatedText: string;
  accumulatedItems: TranscribeItem[];
  abortController: AbortController;
  /** queued compressed chunks awaiting drain */
  backpressureQueue: Buffer[];
  draining: boolean;
}

@WebSocketGateway({
  namespace: '/pronunciation',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  // Enable per-message deflate compression on the WebSocket transport
  perMessageDeflate: {
    threshold: 256, // only compress payloads > 256 bytes
  },
  maxHttpBufferSize: 64 * 1024, // 64 KB max per message (compressed audio chunks)
})
export class PronunciationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('PronunciationGateway');
  private sessions: Map<string, TranscribeSession> = new Map();
  private transcribeClient: TranscribeStreamingClient;

  constructor(
    private config: ConfigService,
    private credits: CreditsService,
    private cognitoAuth: CognitoAuthService,
    private pronunciationService: PronunciationService,
  ) {
    const region =
      this.config.get<string>('AWS_TRANSCRIBE_REGION') ||
      this.config.get<string>('AWS_REGION', 'ap-southeast-2');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.config.get<string>(
      'AWS_SECRET_ACCESS_KEY',
      '',
    );

    this.logger.log(`Transcribe client region: ${region}`);
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

  // ─── start: now accepts targetSentence for server-side auto-assess ───
  @SubscribeMessage('start')
  async handleStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: { language?: string; targetSentence?: string },
  ) {
    const userId = socket.data.user?.id;
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    this.cleanupSession(socket.id);

    const sufficient = await this.credits.hasSufficientCredits(userId, 5);
    if (!sufficient) {
      socket.emit('error', { message: 'Insufficient credits' });
      return;
    }

    try {
      await this.credits.deduct(userId, 5, CreditReason.PRONUNCIATION_SESSION);
    } catch {
      socket.emit('error', { message: 'Failed to deduct credits' });
      return;
    }

    const language = data?.language || 'en-US';
    const audioStream = new PassThrough({ highWaterMark: 32 * 1024 });
    const abortController = new AbortController();

    const session: TranscribeSession = {
      audioStream,
      userId,
      targetSentence: data?.targetSentence || '',
      startedAt: Date.now(),
      minutesBilled: 1,
      accumulatedText: '',
      accumulatedItems: [],
      abortController,
      backpressureQueue: [],
      draining: false,
    };

    this.sessions.set(socket.id, session);
    this.startTranscribeStream(socket, session, language);

    socket.emit('started', { creditsDeducted: 5 });
    this.logger.log(
      `[SESSION_START] user=${userId} lang=${language} target="${session.targetSentence.substring(0, 40)}..."`,
    );
  }

  // ─── audio: decompress pako-deflated chunks, backpressure-aware ───
  @SubscribeMessage('audio')
  handleAudio(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: Buffer | ArrayBuffer,
  ) {
    const session = this.sessions.get(socket.id);
    if (!session) return;

    const compressed = Buffer.isBuffer(data) ? data : Buffer.from(data);

    // Decompress (pako deflateRaw on client → inflateRaw here)
    try {
      const pcm = zlib.inflateRawSync(compressed);
      this.writeWithBackpressure(session, pcm);
    } catch {
      // Fallback: treat as raw PCM if decompression fails (backwards compat)
      this.writeWithBackpressure(session, compressed);
    }
  }

  @SubscribeMessage('stop')
  async handleStop(@ConnectedSocket() socket: Socket) {
    const session = this.sessions.get(socket.id);
    if (!session) return;

    const durationSec = (Date.now() - session.startedAt) / 1000;
    this.cleanupSession(socket.id);

    socket.emit('ended', { durationSec: Math.round(durationSec) });
    this.logger.log(
      `[SESSION_STOP] socket=${socket.id} dur=${durationSec.toFixed(1)}s`,
    );
  }

  // ─── Backpressure-aware write ───
  private writeWithBackpressure(session: TranscribeSession, chunk: Buffer) {
    const ok = session.audioStream.write(chunk);
    if (!ok && !session.draining) {
      session.draining = true;
      session.audioStream.once('drain', () => {
        session.draining = false;
        // Flush queued chunks
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
    session: TranscribeSession,
    language: string,
  ) {
    try {
      const audioGenerator = this.createAsyncAudioGenerator(
        session.audioStream,
      );

      const response = await this.transcribeClient.send(
        new StartStreamTranscriptionCommand({
          LanguageCode: language as LanguageCode,
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

            if (result.IsPartial) {
              // Skip partial results — only process final segments
            } else {
              // Final segment — accumulate
              session.accumulatedText = session.accumulatedText
                ? session.accumulatedText + ' ' + text
                : text;

              if (alt?.Items) {
                for (const item of alt.Items) {
                  if (item.Content) {
                    session.accumulatedItems.push({
                      content: item.Content,
                      confidence: item.Confidence ?? 1,
                      startTime: item.StartTime ?? 0,
                      endTime: item.EndTime ?? 0,
                      type:
                        item.Type === 'punctuation'
                          ? 'punctuation'
                          : 'pronunciation',
                    });
                  }
                }
              }

              // Reset silence timer — emit final + auto-assess after 1.5s silence
              if (session.silenceTimer) {
                clearTimeout(session.silenceTimer);
              }
              session.silenceTimer = setTimeout(() => {
                if (this.sessions.has(socket.id)) {
                  const finalText = session.accumulatedText.trim();
                  const finalItems = [...session.accumulatedItems];

                  // Emit the transcript immediately
                  socket.emit('final', {
                    text: finalText,
                    items: finalItems,
                  });

                  // Auto-assess if targetSentence was provided
                  if (session.targetSentence) {
                    this.autoAssess(
                      socket,
                      session,
                      finalText,
                      finalItems,
                    );
                  }
                }
              }, 1500);
            }
          }

          // Bill additional minutes
          const elapsedMin = Math.floor(
            (Date.now() - session.startedAt) / 60000,
          );
          if (elapsedMin > session.minutesBilled) {
            try {
              await this.credits.deduct(
                session.userId,
                3,
                CreditReason.PRONUNCIATION_SESSION,
                undefined,
                { minute: elapsedMin },
              );
              session.minutesBilled = elapsedMin;
            } catch {
              // Ignore billing errors during stream
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

  // ─── Server-side auto-assessment after final transcript ───
  private async autoAssess(
    socket: Socket,
    session: TranscribeSession,
    spokenText: string,
    items: TranscribeItem[],
  ) {
    socket.emit('assessing', { message: 'Analyzing pronunciation...' });

    try {
      const assessment = await this.pronunciationService.assess(
        session.targetSentence,
        spokenText,
        items,
      );

      // Deduct assessment credits
      try {
        await this.credits.deduct(
          session.userId,
          2,
          CreditReason.AI_GRADING,
        );
      } catch {
        // Don't block assessment if credit deduction fails
      }

      socket.emit('assessment', {
        assessment,
        spokenText,
        targetSentence: session.targetSentence,
      });

      this.logger.log(
        `[ASSESSMENT] socket=${socket.id} overall=${assessment.overall.score}`,
      );
    } catch (err: any) {
      this.logger.error(`[ASSESSMENT_FAIL] ${err.message}`);
      socket.emit('error', { message: 'Assessment failed' });
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

    if (session.silenceTimer) clearTimeout(session.silenceTimer);
    session.backpressureQueue.length = 0;
    session.abortController.abort();
    session.audioStream.end();
    this.sessions.delete(socketId);
  }

  private async authenticateSocket(
    socket: Socket,
  ): Promise<{ id: string; email: string; role: string }> {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) throw new Error('No cookies');

    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach((c) => {
      const [key, ...val] = c.trim().split('=');
      cookies[key] = val.join('=');
    });

    const token = cookies['access_token'];
    if (!token) throw new Error('No access_token cookie');

    const payload = await this.cognitoAuth.verifyCognitoJwt(token);
    const user = await this.cognitoAuth.findOrCreateFromCognito(
      payload.sub,
      payload.email ?? payload.username ?? '',
      payload['cognito:groups'],
    );
    return { id: user.id, email: user.email, role: user.role };
  }
}
