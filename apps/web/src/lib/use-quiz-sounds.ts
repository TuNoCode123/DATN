import { useCallback, useEffect, useRef } from 'react';

export type QuizSoundName =
  | 'correct'
  | 'wrong'
  | 'click'
  | 'complete'
  | 'streak'
  | 'leaderboard';

const SOUND_SOURCES: Record<QuizSoundName, string> = {
  correct: '/sounds/correct.mp3',
  wrong: '/sounds/wrong.wav',
  click: '/sounds/click.wav',
  complete: '/sounds/complete.wav',
  streak: '/sounds/streak.wav',
  leaderboard: '/sounds/leaderboard.mp3',
};

// Per-clip volume so loud effects don't overpower subtle ones.
const VOLUMES: Record<QuizSoundName, number> = {
  correct: 0.55,
  wrong: 0.5,
  click: 0.3,
  complete: 0.6,
  streak: 0.55,
  leaderboard: 0.6,
};

/**
 * Preloads every quiz sound exactly once and exposes a `play(name)` API.
 *
 * - Audio objects are created once and reused (no recreation on click).
 * - `currentTime = 0` before play so rapid re-triggers restart cleanly.
 * - play() rejections (autoplay policies) are swallowed silently.
 * - Safe during SSR: the pool is only built inside useEffect.
 */
export function useQuizSounds() {
  const poolRef = useRef<Record<QuizSoundName, HTMLAudioElement> | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pool = {} as Record<QuizSoundName, HTMLAudioElement>;
    (Object.keys(SOUND_SOURCES) as QuizSoundName[]).forEach((name) => {
      const audio = new Audio(SOUND_SOURCES[name]);
      audio.preload = 'auto';
      audio.volume = VOLUMES[name];
      pool[name] = audio;
    });
    poolRef.current = pool;

    return () => {
      Object.values(pool).forEach((a) => {
        a.pause();
        a.src = '';
      });
      poolRef.current = null;
    };
  }, []);

  const play = useCallback((name: QuizSoundName) => {
    if (mutedRef.current) return;
    const audio = poolRef.current?.[name];
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const stop = useCallback((name: QuizSoundName) => {
    const audio = poolRef.current?.[name];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    if (muted) {
      Object.values(poolRef.current ?? {}).forEach((a) => a.pause());
    }
  }, []);

  return { play, stop, setMuted };
}
