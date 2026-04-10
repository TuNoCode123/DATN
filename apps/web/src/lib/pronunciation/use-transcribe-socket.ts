'use client';

import { useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TranscribeItem, PronunciationAssessment } from './types';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

interface UseTranscribeSocketOptions {
  onFinal: (text: string, items: TranscribeItem[]) => void;
  onAssessing?: () => void;
  onAssessment?: (data: {
    assessment: PronunciationAssessment;
    spokenText: string;
    targetSentence: string;
  }) => void;
  onError: (message: string) => void;
  onStarted?: () => void;
  onEnded?: (durationSec: number) => void;
}

export function useTranscribeSocket({
  onPartial,
  onFinal,
  onAssessing,
  onAssessment,
  onError,
  onStarted,
  onEnded,
}: UseTranscribeSocketOptions) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${SOCKET_URL}/pronunciation`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: false,
      autoConnect: true,
    });

    socket.on('final', (data: { text: string; items?: TranscribeItem[] }) => {
      onFinal(data.text, data.items || []);
    });

    socket.on('assessing', () => {
      onAssessing?.();
    });

    socket.on(
      'assessment',
      (data: {
        assessment: PronunciationAssessment;
        spokenText: string;
        targetSentence: string;
      }) => {
        onAssessment?.(data);
      },
    );

    socket.on('error', (data: { message: string }) => {
      onError(data.message);
    });

    socket.on('started', () => {
      onStarted?.();
    });

    socket.on('ended', (data: { durationSec: number }) => {
      onEnded?.(data.durationSec);
    });

    socket.on('connect_error', (err) => {
      console.error('[Pronunciation WS] Connect error:', err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = useCallback(
    (language = 'en-US', targetSentence?: string) => {
      socketRef.current?.emit('start', { language, targetSentence });
    },
    [],
  );

  const sendAudio = useCallback((chunk: ArrayBuffer) => {
    socketRef.current?.emit('audio', chunk);
  }, []);

  const stopSession = useCallback(() => {
    socketRef.current?.emit('stop');
  }, []);

  return { startSession, sendAudio, stopSession };
}
