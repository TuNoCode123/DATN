'use client';

import { useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

export interface SpeakingAssessment {
  wordScores: WordScore[];
  pronunciationScore: number;
  fluencyScore: number;
  completenessScore: number;
  overallScore: number;
  spokenSentence: string;
  targetSentence: string;
  finalTranscript: string;
  totalDuration: number;
  pauseCount: number;
  totalPauseTime: number;
  autoCorrectionCount: number;
}

export interface WordScore {
  word: string;
  targetWord: string | null;
  status: 'correct' | 'warning' | 'incorrect' | 'missing' | 'extra';
  confidence: number;
  startTime: number;
  endTime: number;
  pauseBefore: number;
  wasAutoCorrected: boolean;
  details: string;
}

interface UseSpeakingSocketOptions {
  onPartial?: (transcript: string) => void;
  onAssessment?: (assessment: SpeakingAssessment) => void;
  onError?: (message: string) => void;
  onStarted?: (data: { creditsDeducted: number }) => void;
}

export function useSpeakingSocket({
  onPartial,
  onAssessment,
  onError,
  onStarted,
}: UseSpeakingSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef({ onPartial, onAssessment, onError, onStarted });
  callbacksRef.current = { onPartial, onAssessment, onError, onStarted };

  const ensureSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    // Disconnect stale socket if any
    socketRef.current?.disconnect();

    const socket = io(`${SOCKET_URL}/speaking`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: false,
      autoConnect: true,
    });

    socket.on('partial', (data: { transcript: string }) => {
      callbacksRef.current.onPartial?.(data.transcript);
    });

    socket.on('assessment', (data: SpeakingAssessment) => {
      callbacksRef.current.onAssessment?.(data);
    });

    socket.on('error', (data: { message: string }) => {
      callbacksRef.current.onError?.(data.message);
    });

    socket.on('started', (data: { creditsDeducted: number }) => {
      callbacksRef.current.onStarted?.(data);
    });

    socket.on('connect_error', (err) => {
      console.error('[Speaking WS] Connect error:', err.message);
      callbacksRef.current.onError?.('Connection failed. Please try again.');
    });

    socketRef.current = socket;
    return socket;
  }, []);

  const startRecording = useCallback(
    (payload: {
      questionId: string;
      attemptId: string;
      targetText?: string;
      questionType?: string;
      questionStem?: string;
    }) => {
      const socket = ensureSocket();
      // If already connected, emit immediately; otherwise wait for connect
      if (socket.connected) {
        socket.emit('start-recording', payload);
      } else {
        socket.once('connect', () => {
          socket.emit('start-recording', payload);
        });
      }
    },
    [ensureSocket],
  );

  const sendAudioChunk = useCallback((chunk: ArrayBuffer) => {
    socketRef.current?.emit('audio-chunk', chunk);
  }, []);

  const stopRecording = useCallback(() => {
    socketRef.current?.emit('stop-recording');
  }, []);

  return { startRecording, sendAudioChunk, stopRecording };
}
