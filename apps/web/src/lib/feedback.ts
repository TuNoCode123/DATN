'use client';

const SOUND_SRCS = {
  correct: '/sounds/correct.mp3',
  wrong: '/sounds/wrong.wav',
  complete: '/sounds/complete.wav',
  click: '/sounds/click.wav',
  streak: '/sounds/streak.wav',
  leaderboard: '/sounds/leaderboard.mp3',
} as const;

export type SoundKey = keyof typeof SOUND_SRCS;

export function playSound(key: SoundKey, volume = 0.55) {
  if (typeof window === 'undefined') return;
  try {
    const audio = new Audio(SOUND_SRCS[key]);
    audio.volume = volume;
    void audio.play().catch(() => {});
  } catch {}
}

export const LOTTIE = {
  celebrate: '/celebrate.json',
  thumbsUp: '/Thumbs%20up%20birdie.json',
  wrong: '/Wrong%20sign.json',
  trophy: '/Trophy.json',
  loading: '/Sandy%20Loading.json',
  error404: '/Error%20404.json',
  welcome: '/Welcome.json',
} as const;

const CORRECT_POOL = [LOTTIE.celebrate, LOTTIE.thumbsUp];

export function pickCorrectLottie() {
  return CORRECT_POOL[Math.floor(Math.random() * CORRECT_POOL.length)];
}
