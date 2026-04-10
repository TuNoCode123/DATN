'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Loader2 } from 'lucide-react';
import { useMicrophone } from '@/lib/pronunciation/use-microphone';
import {
  useSpeakingSocket,
  type SpeakingAssessment,
} from '@/lib/speaking/use-speaking-socket';
import { api } from '@/lib/api';

type RecordingState =
  | 'idle'
  | 'connecting'
  | 'recording'
  | 'analyzing'
  | 'scored';

interface AudioRecorderProps {
  questionId: string;
  attemptId: string;
  targetText?: string;
  questionType?: string;
  questionStem?: string;
  prepTime?: number;
  responseTime?: number;
  onResult?: (assessment: SpeakingAssessment) => void;
  onTranscript?: (text: string) => void;
  disabled?: boolean;
}

export function AudioRecorder({
  questionId,
  attemptId,
  targetText,
  questionType,
  questionStem,
  prepTime,
  responseTime,
  onResult,
  onTranscript,
  disabled,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [assessment, setAssessment] = useState<SpeakingAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const blobRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const { startRecording, sendAudioChunk, stopRecording } = useSpeakingSocket({
    onPartial: (transcript) => {
      setLiveTranscript(transcript);
      onTranscript?.(transcript);
    },
    onAssessment: (result) => {
      setState('scored');
      setAssessment(result);
      onResult?.(result);
      // Upload audio to S3 after assessment
      uploadAudio();
    },
    onError: (msg) => {
      setError(msg);
      setState('idle');
    },
    onStarted: () => {
      setState('recording');
    },
  });

  const { start: startMic, stop: stopMic } = useMicrophone({
    onAudioChunk: sendAudioChunk,
  });

  const uploadAudio = useCallback(async () => {
    // Wait a bit for MediaRecorder to finalize chunks
    await new Promise((r) => setTimeout(r, 500));
    if (!attemptId || !questionId || blobRef.current.length === 0) return;
    try {
      const { data } = await api.post(
        `/attempts/${attemptId}/answers/${questionId}/audio-presign`,
      );
      const blob = new Blob(blobRef.current, { type: 'audio/webm' });
      await fetch(data.uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'audio/webm' },
      });
    } catch {
      // Non-critical — audio upload failed silently
    }
  }, [attemptId, questionId]);

  // Recording timer
  useEffect(() => {
    if (state === 'recording') {
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => {
          const next = t + 1;
          if (responseTime && next >= responseTime) {
            handleStop();
          }
          return next;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleStart = useCallback(async () => {
    setError(null);
    setAssessment(null);
    setLiveTranscript('');
    blobRef.current = [];

    // Ensure auth token is fresh before WebSocket connect
    // (the axios interceptor auto-refreshes expired tokens)
    try {
      await api.get('/auth/cognito/me');
    } catch {
      setError('Not authenticated. Please refresh the page or log in again.');
      return;
    }

    // Prep countdown
    if (prepTime && prepTime > 0) {
      setState('connecting');
      setCountdown(prepTime);
      for (let i = prepTime; i > 0; i--) {
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);
    }

    setState('connecting');
    startRecording({ questionId, attemptId, targetText, questionType, questionStem });
    await startMic();

    // Also start a MediaRecorder for the backup blob
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) blobRef.current.push(e.data);
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
    } catch {
      // Non-critical — backup recording failed
    }
  }, [questionId, attemptId, targetText, prepTime, startRecording, startMic]);

  const handleStop = useCallback(() => {
    stopMic();
    stopRecording();
    setState('analyzing');

    // Stop backup MediaRecorder
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
  }, [stopMic, stopRecording]);

  const handleReRecord = useCallback(() => {
    setState('idle');
    setAssessment(null);
    setLiveTranscript('');
    setRecordingTime(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Prep countdown */}
      {countdown !== null && (
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600">{countdown}</div>
          <div className="text-sm text-slate-500">Preparation time</div>
        </div>
      )}

      {/* Live transcript */}
      {state === 'recording' && liveTranscript && (
        <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-3 text-sm text-slate-700 min-h-[60px]">
          {liveTranscript}
        </div>
      )}

      {/* Recording controls */}
      <div className="flex items-center gap-3">
        {state === 'idle' && (
          <button
            onClick={handleStart}
            disabled={disabled}
            className="brutal-btn bg-red-500 text-white px-6 py-3 text-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Mic className="w-4 h-4" />
            THU AM
          </button>
        )}

        {state === 'connecting' && countdown === null && (
          <button
            disabled
            className="brutal-btn bg-gray-400 text-white px-6 py-3 text-sm flex items-center gap-2 cursor-not-allowed"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting...
          </button>
        )}

        {state === 'recording' && (
          <>
            <button
              onClick={handleStop}
              className="brutal-btn bg-slate-800 text-white px-6 py-3 text-sm flex items-center gap-2 cursor-pointer"
            >
              <Square className="w-4 h-4" />
              DUNG
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {formatTime(recordingTime)}
              {responseTime && (
                <span className="text-slate-400">
                  / {formatTime(responseTime)}
                </span>
              )}
            </div>
          </>
        )}

        {state === 'analyzing' && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing...
          </div>
        )}

        {state === 'scored' && (
          <div className="flex items-center gap-3">
            {assessment && blobRef.current.length > 0 && (
              <button
                onClick={() => {
                  if (isPlaying && audioRef.current) {
                    audioRef.current.pause();
                    setIsPlaying(false);
                    return;
                  }
                  if (!audioRef.current) {
                    const blob = new Blob(blobRef.current, {
                      type: 'audio/webm',
                    });
                    const url = URL.createObjectURL(blob);
                    audioRef.current = new Audio(url);
                    audioRef.current.onended = () => setIsPlaying(false);
                  }
                  audioRef.current.play();
                  setIsPlaying(true);
                }}
                className="brutal-btn bg-blue-500 text-white px-4 py-2 text-sm flex items-center gap-2 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            )}
            <button
              onClick={handleReRecord}
              className="brutal-btn bg-slate-200 text-slate-700 px-4 py-2 text-sm flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Re-record
            </button>
          </div>
        )}
      </div>

      {/* Score summary */}
      {state === 'scored' && assessment && (
        <div className="brutal-card p-4 bg-white">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {assessment.overallScore}
              </div>
              <div className="text-xs text-slate-500">Overall</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">
                {assessment.pronunciationScore}
              </div>
              <div className="text-xs text-slate-500">Pronunciation</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">
                {assessment.fluencyScore}
              </div>
              <div className="text-xs text-slate-500">Fluency</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">
                {assessment.completenessScore}
              </div>
              <div className="text-xs text-slate-500">Completeness</div>
            </div>
          </div>

          {/* Word-by-word detailed results */}
          {assessment.wordScores.length > 0 && (
            <div className="space-y-3">
              {/* Colored word flow */}
              <div className="flex flex-wrap gap-1">
                {assessment.wordScores.map((ws, i) => (
                  <span
                    key={i}
                    className={`px-1.5 py-0.5 rounded text-sm font-medium ${
                      ws.status === 'correct'
                        ? 'bg-green-100 text-green-800'
                        : ws.status === 'warning'
                          ? 'bg-yellow-100 text-yellow-800'
                          : ws.status === 'incorrect'
                            ? 'bg-red-100 text-red-800'
                            : ws.status === 'missing'
                              ? 'bg-gray-100 text-gray-500 line-through'
                              : 'bg-purple-100 text-purple-800'
                    }`}
                    title={ws.details || ws.status}
                  >
                    {ws.word || ws.targetWord || '?'}
                  </span>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-200 border border-green-400" /> Correct</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-200 border border-yellow-400" /> Warning</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-200 border border-red-400" /> Incorrect</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-200 border border-gray-400" /> Missing</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-purple-200 border border-purple-400" /> Extra</span>
              </div>

              {/* Detailed word table */}
              <details className="group">
                <summary className="text-sm text-blue-600 cursor-pointer hover:underline font-medium">
                  Show detailed word analysis ({assessment.wordScores.length} words)
                </summary>
                <div className="mt-2 border-2 border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b-2 border-slate-200">
                        <th className="text-left px-3 py-2 font-semibold">#</th>
                        <th className="text-left px-3 py-2 font-semibold">Target</th>
                        <th className="text-left px-3 py-2 font-semibold">Spoken</th>
                        <th className="text-left px-3 py-2 font-semibold">Status</th>
                        <th className="text-left px-3 py-2 font-semibold">Confidence</th>
                        <th className="text-left px-3 py-2 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assessment.wordScores.map((ws, i) => (
                        <tr
                          key={i}
                          className={`border-b border-slate-100 ${
                            ws.status === 'incorrect' || ws.status === 'missing'
                              ? 'bg-red-50/50'
                              : ws.status === 'warning'
                                ? 'bg-yellow-50/50'
                                : ''
                          }`}
                        >
                          <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium">
                            {ws.targetWord || '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            {ws.word || <span className="text-slate-400 italic">not spoken</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                ws.status === 'correct'
                                  ? 'bg-green-100 text-green-700'
                                  : ws.status === 'warning'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : ws.status === 'incorrect'
                                      ? 'bg-red-100 text-red-700'
                                      : ws.status === 'missing'
                                        ? 'bg-gray-100 text-gray-600'
                                        : 'bg-purple-100 text-purple-700'
                              }`}
                            >
                              {ws.status}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            {ws.status !== 'missing' ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      ws.confidence >= 0.8
                                        ? 'bg-green-500'
                                        : ws.confidence >= 0.5
                                          ? 'bg-yellow-500'
                                          : 'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.round(ws.confidence * 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-500">
                                  {Math.round(ws.confidence * 100)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-slate-500 max-w-[200px] truncate">
                            {ws.details || '—'}
                            {ws.pauseBefore > 0.5 && (
                              <span className="ml-1 text-orange-500" title={`${ws.pauseBefore.toFixed(1)}s pause before this word`}>
                                ⏸ {ws.pauseBefore.toFixed(1)}s
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Speaking stats */}
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500 px-1">
                  {assessment.totalDuration > 0 && (
                    <span>Duration: <strong>{assessment.totalDuration.toFixed(1)}s</strong></span>
                  )}
                  {assessment.pauseCount > 0 && (
                    <span>Pauses: <strong>{assessment.pauseCount}</strong> ({assessment.totalPauseTime.toFixed(1)}s total)</span>
                  )}
                  {assessment.autoCorrectionCount > 0 && (
                    <span>Auto-corrections: <strong>{assessment.autoCorrectionCount}</strong></span>
                  )}
                  {assessment.finalTranscript && (
                    <span className="basis-full mt-1">
                      Transcript: <em className="text-slate-600">&quot;{assessment.finalTranscript}&quot;</em>
                    </span>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
