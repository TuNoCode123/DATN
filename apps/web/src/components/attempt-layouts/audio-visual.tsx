"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { RichContent } from "@/components/rich-content";
import type { LayoutProps } from "./types";

function normalizeOptions(
  raw: unknown
): { label: string; text: string }[] {
  const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === "string") {
    return (raw as string[]).map((text, i) => ({
      label: LETTERS[i] ?? String(i + 1),
      text,
    }));
  }
  return raw as { label: string; text: string }[];
}

function AudioPlayerBar({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onTogglePlay,
  onSeek,
  onChangeVolume,
  onToggleMute,
}: {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  onTogglePlay: () => void;
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
  onChangeVolume: (e: React.MouseEvent<HTMLDivElement>) => void;
  onToggleMute: () => void;
}) {
  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 px-5 bg-white shrink-0 h-12">
      <button
        onClick={onTogglePlay}
        className="text-slate-600 hover:text-primary flex items-center cursor-pointer"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex-1 flex items-center gap-2" style={{ minWidth: 0 }}>
        <span className="text-slate-500 tabular-nums shrink-0 text-xs">
          {formatTime(currentTime)}
        </span>
        <div className="relative flex-1 cursor-pointer h-1.5" onClick={onSeek}>
          <div className="absolute inset-0 rounded-full bg-slate-200" />
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white shadow"
            style={{ left: `${progress}%` }}
          />
        </div>
        <span className="text-slate-400 tabular-nums shrink-0 text-xs">
          {formatTime(duration)}
        </span>
      </div>
      <button onClick={onToggleMute} className="cursor-pointer text-slate-500 hover:text-primary">
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
      <div
        className="relative cursor-pointer shrink-0 h-1.5"
        style={{ width: 64 }}
        onClick={onChangeVolume}
      >
        <div className="absolute inset-0 rounded-full bg-slate-200" />
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-primary"
          style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function AudioVisualLayout({
  section,
  answers,
  onAnswer,
}: LayoutProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [isMuted, setIsMuted] = useState(false);

  const sortedGroups = [...section.questionGroups].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDur = () => setDuration(audio.duration || 0);
    const onEnd = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play();
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
  };

  const changeVolume = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.volume = volume || 0.75;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const audioPlayerProps = {
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    onTogglePlay: togglePlay,
    onSeek: seek,
    onChangeVolume: changeVolume,
    onToggleMute: toggleMute,
  };

  // Flatten questions, carrying group-level media
  const questionsWithMedia = sortedGroups.flatMap((group) => {
    const sortedQs = [...group.questions].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );
    return sortedQs.map((q) => ({
      ...q,
      groupImageUrl: group.imageUrl,
      groupAudioUrl: group.audioUrl,
      options: normalizeOptions(q.options),
    }));
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Hidden audio element */}
      {section.audioUrl && (
        <audio ref={audioRef} src={section.audioUrl} preload="metadata" />
      )}

      {/* Top audio player */}
      <div className="border-b border-slate-200">
        <AudioPlayerBar {...audioPlayerProps} />
      </div>

      {/* Section instructions */}
      {section.instructions && (
        <div className="px-5 py-3 bg-blue-50 border-b border-slate-200 shrink-0">
          <div className="text-sm text-slate-700 italic leading-relaxed">
            <RichContent html={section.instructions} />
          </div>
        </div>
      )}

      {/* Main content: image + compact questions */}
      <div className="flex-1 overflow-y-auto">
        {questionsWithMedia.map((q, idx) => {
          // Only render group image once per group (when it changes)
          const showGroupImage =
            idx === 0 ||
            q.groupImageUrl !== questionsWithMedia[idx - 1]?.groupImageUrl;

          return (
            <div key={q.id} id={`question-${q.id}`}>
              {/* Group image — large, taking full width */}
              {showGroupImage && q.groupImageUrl && (
                <div className="flex justify-center bg-white px-5 pt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={q.groupImageUrl}
                    alt={`Question ${q.questionNumber}`}
                    className="max-w-full max-h-[60vh] object-contain"
                  />
                </div>
              )}

              {/* Question-level image */}
              {q.imageUrl && (
                <div className="flex justify-center bg-white px-5 pt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={q.imageUrl}
                    alt={`Question ${q.questionNumber}`}
                    className="max-w-full max-h-[60vh] object-contain"
                  />
                </div>
              )}

              {/* Compact horizontal options: "1  ○ A.  ○ B.  ○ C.  ○ D." */}
              <div className="px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs shrink-0 border border-amber-200">
                    {q.questionNumber}
                  </span>
                  <div className="flex items-center gap-5">
                    {q.options.map((opt) => (
                      <label
                        key={opt.label}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`q${q.id}`}
                          value={opt.label}
                          checked={answers[q.id] === opt.label}
                          onChange={() => onAnswer(q.id, opt.label)}
                          className="accent-primary"
                        />
                        <span className="text-sm text-slate-700">
                          {opt.label}.
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom audio player */}
      <div className="border-t border-slate-200">
        <AudioPlayerBar {...audioPlayerProps} />
      </div>
    </div>
  );
}
