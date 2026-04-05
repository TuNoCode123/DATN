'use client';

import { useRef, useState, useCallback } from 'react';
import { deflateRaw } from 'pako';

/** Target chunk size in bytes before compression (~8 KB of PCM = ~250ms at 16kHz mono int16) */
const CHUNK_BYTES = 8192;

interface UseMicrophoneOptions {
  sampleRate?: number;
  onAudioChunk: (chunk: ArrayBuffer) => void;
}

export function useMicrophone({
  sampleRate = 16000,
  onAudioChunk,
}: UseMicrophoneOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Accumulation buffer for incomplete chunks */
  const bufferRef = useRef<Int16Array>(new Int16Array(0));

  const flush = useCallback(
    (pcm: Int16Array) => {
      // Compress with pako deflateRaw (raw DEFLATE, no zlib header)
      const compressed = deflateRaw(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
      onAudioChunk(compressed.buffer);
    },
    [onAudioChunk],
  );

  const start = useCallback(async () => {
    bufferRef.current = new Int16Array(0);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const ctx = new AudioContext({ sampleRate });
    const source = ctx.createMediaStreamSource(stream);

    // ScriptProcessorNode for broad compatibility
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);

      // Convert float32 → int16 PCM
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Accumulate into buffer, flush when we have enough
      const prev = bufferRef.current;
      const merged = new Int16Array(prev.length + int16.length);
      merged.set(prev);
      merged.set(int16, prev.length);

      const chunkSamples = CHUNK_BYTES / 2; // int16 = 2 bytes per sample
      let offset = 0;
      while (offset + chunkSamples <= merged.length) {
        flush(merged.slice(offset, offset + chunkSamples));
        offset += chunkSamples;
      }
      // Keep remainder for next callback
      bufferRef.current = merged.slice(offset);
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    audioContextRef.current = ctx;
    workletRef.current = processor;
    streamRef.current = stream;
    setIsRecording(true);
  }, [sampleRate, flush]);

  const stop = useCallback(() => {
    // Flush any remaining buffered audio
    if (bufferRef.current.length > 0) {
      flush(bufferRef.current);
      bufferRef.current = new Int16Array(0);
    }

    workletRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current = null;
    workletRef.current = null;
    streamRef.current = null;
    setIsRecording(false);
  }, [flush]);

  return { isRecording, start, stop };
}
