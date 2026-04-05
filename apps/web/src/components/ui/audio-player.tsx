"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Settings,
} from "lucide-react";

interface AudioPlayerProps {
  src: string;
  className?: string;
}

export function AudioPlayer({ src, className = "" }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (!isDragging) setCurrentTime(audio.currentTime);
    };
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
  }, [isDragging]);

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

  const seekTo = (clientX: number) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    seekTo(e.clientX);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    seekTo(e.clientX);

    const onMouseMove = (ev: MouseEvent) => seekTo(ev.clientX);
    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const changeVolume = (newVolume: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const v = Math.max(0, Math.min(1, newVolume));
    audio.volume = v;
    setVolume(v);
    if (v === 0) {
      setIsMuted(true);
      audio.muted = true;
    } else if (isMuted) {
      setIsMuted(false);
      audio.muted = false;
    }
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = volumeRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    changeVolume(pct);
  };

  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVolumeDragging(true);
    const bar = volumeRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    changeVolume(pct);

    const onMouseMove = (ev: MouseEvent) => {
      const r = bar.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      changeVolume(p);
    };
    const onMouseUp = () => {
      setIsVolumeDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const setSpeed = (speed: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    setPlaybackRate(speed);
    setShowSpeedMenu(false);
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = isMuted ? 0 : volume * 100;

  return (
    <div className={`flex items-center gap-3 py-2 select-none w-full min-w-0 ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        className="flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4" fill="currentColor" />
        )}
      </button>

      {/* Progress bar */}
      <div
        ref={progressRef}
        className="relative flex-1 cursor-pointer h-5 flex items-center group"
        onClick={handleProgressClick}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute left-0 right-0 h-[3px] rounded-full bg-slate-200" />
        <div
          className="absolute left-0 h-[3px] rounded-full bg-[#0ea5e9]"
          style={{ width: `${progress}%` }}
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-[#0ea5e9] shadow-sm transition-opacity ${
            isPlaying || isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ left: `calc(${progress}% - 6px)` }}
        />
      </div>

      {/* Time */}
      <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap shrink-0">
        {formatTime(currentTime)}
      </span>

      {/* Volume icon */}
      <button
        onClick={toggleMute}
        className="flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="w-4 h-4" />
        ) : volume < 0.5 ? (
          <Volume1 className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>

      {/* Volume slider — hidden on mobile */}
      <div
        ref={volumeRef}
        className="relative w-20 h-5 items-center cursor-pointer shrink-0 group hidden md:flex"
        onClick={handleVolumeClick}
        onMouseDown={handleVolumeMouseDown}
      >
        <div className="absolute left-0 right-0 h-1 rounded-full bg-slate-200" />
        <div
          className="absolute left-0 h-1 rounded-full bg-blue-500"
          style={{ width: `${volumePercent}%` }}
        />
      </div>

      {/* Settings / Speed */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowSpeedMenu(!showSpeedMenu)}
          className="flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
        {showSpeedMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowSpeedMenu(false)}
            />
            <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-20 min-w-[100px]">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Speed
              </div>
              {SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => setSpeed(speed)}
                  className={`w-full text-left px-3 py-1 text-xs hover:bg-slate-50 transition-colors cursor-pointer ${
                    playbackRate === speed
                      ? "text-blue-500 font-semibold"
                      : "text-slate-600"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
