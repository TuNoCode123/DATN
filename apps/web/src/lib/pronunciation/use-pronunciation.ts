'use client';

import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useMicrophone } from './use-microphone';
import { useTranscribeSocket } from './use-transcribe-socket';
import type { PronunciationAssessment, PronunciationPhase } from './types';

interface UsePronunciationOptions {
  targetSentence: string;
  language?: string;
  onComplete?: (assessment: PronunciationAssessment, spokenText: string) => void;
  attemptId?: string;
  questionId?: string;
}

export function usePronunciation({
  targetSentence,
  language = 'en-US',
  onComplete,
  attemptId,
  questionId,
}: UsePronunciationOptions) {
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [phase, setPhase] = useState<PronunciationPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const retryCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { startSession, sendAudio, stopSession } = useTranscribeSocket({
    onPartial: (text) => {
      setPartialText(text);
    },
    onFinal: (text) => {
      setSpokenText(text);
      mic.stop();
      stopSession();
      stopTimer();
      // Phase transitions to 'assessing' via the 'assessing' WS event
    },
    onAssessing: () => {
      setPhase('assessing');
    },
    onAssessment: async (data) => {
      setAssessment(data.assessment);
      setPhase('done');

      // Persist to attempt if applicable (fire-and-forget)
      if (attemptId && questionId) {
        try {
          await api.post(`/pronunciation/sessions/${attemptId}/results`, {
            sentenceIndex: 0,
            targetSentence: data.targetSentence,
            spokenText: data.spokenText,
            assessment: data.assessment,
          });
        } catch {
          // Non-critical — assessment already displayed
        }
      }

      onComplete?.(data.assessment, data.spokenText);
    },
    onError: (message) => {
      setError(message);
      mic.stop();
      stopTimer();
      setPhase('idle');
    },
    onStarted: () => {
      // Session confirmed by server
    },
  });

  const mic = useMicrophone({
    sampleRate: 16000,
    onAudioChunk: (chunk) => {
      sendAudio(chunk);
    },
  });

  function startTimer() {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const startListening = useCallback(async () => {
    setError(null);
    setSpokenText(null);
    setAssessment(null);
    setPhase('listening');

    try {
      // Pass targetSentence so the server can auto-assess
      startSession(language, targetSentence);
      await mic.start();
      startTimer();
    } catch (err: any) {
      setError(err.message || 'Failed to start microphone');
      setPhase('idle');
    }
  }, [language, targetSentence, mic, startSession]);

  const stopListening = useCallback(() => {
    mic.stop();
    stopSession();
    stopTimer();
    setPhase('idle');
  }, [mic, stopSession]);

  const retry = useCallback(() => {
    retryCountRef.current += 1;
    setSpokenText(null);
    setAssessment(null);
    setError(null);
    setElapsedSec(0);
    setPhase('idle');
  }, []);

  const playTts = useCallback(async () => {
    if (ttsUrl) {
      const audio = new Audio(ttsUrl);
      await audio.play();
      return;
    }

    setIsTtsLoading(true);
    try {
      const res = await api.post('/pronunciation/tts', {
        sentence: targetSentence,
      });
      const url = res.data.audioUrl;
      setTtsUrl(url);
      const audio = new Audio(url);
      await audio.play();
    } catch {
      setError('Failed to load TTS audio');
    } finally {
      setIsTtsLoading(false);
    }
  }, [targetSentence, ttsUrl]);

  return {
    // State
    spokenText,
    assessment,
    phase,
    error,
    isTtsLoading,
    isListening: phase === 'listening',
    isAssessing: phase === 'assessing',
    isDone: phase === 'done',
    elapsedSec,
    retryCount: retryCountRef.current,

    // Actions
    startListening,
    stopListening,
    retry,
    playTts,
  };
}
