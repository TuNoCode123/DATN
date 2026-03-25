"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { QuestionGroupRenderer } from "@/components/question-renderers";
import type { LayoutProps } from "./types";

export function AudioQuestionsLayout({
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
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
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

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Audio player */}
      {section.audioUrl && <audio ref={audioRef} src={section.audioUrl} preload="metadata" />}
      <div className="flex items-center gap-3 px-5 border-b border-slate-200 bg-white shrink-0 h-12">
        <button
          onClick={togglePlay}
          className="text-slate-600 hover:text-primary flex items-center cursor-pointer"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <div className="flex-1 flex items-center gap-2" style={{ minWidth: 0 }}>
          <span className="text-slate-500 tabular-nums shrink-0 text-xs">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1 cursor-pointer h-1.5" onClick={seek}>
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

        <button onClick={toggleMute} className="cursor-pointer text-slate-500 hover:text-primary">
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <div className="relative cursor-pointer shrink-0 h-1.5" style={{ width: 64 }} onClick={changeVolume}>
          <div className="absolute inset-0 rounded-full bg-slate-200" />
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-primary"
            style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl">
          {sortedGroups.map((group, gi) => (
            <div key={group.id}>
              {gi > 0 && <hr className="border-slate-200" />}
              <QuestionGroupRenderer
                group={group}
                answers={answers}
                onAnswer={onAnswer}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
