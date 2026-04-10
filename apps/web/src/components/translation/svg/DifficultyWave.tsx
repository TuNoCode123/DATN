'use client';

interface DifficultyWaveProps {
  difficulty: string;
  className?: string;
}

const WAVE_COLORS: Record<string, { from: string; to: string }> = {
  BEGINNER: { from: '#10B981', to: '#34D399' },
  INTERMEDIATE: { from: '#F59E0B', to: '#FBBF24' },
  ADVANCED: { from: '#EF4444', to: '#F87171' },
};

export function DifficultyWave({ difficulty, className = '' }: DifficultyWaveProps) {
  const colors = WAVE_COLORS[difficulty] || WAVE_COLORS.INTERMEDIATE;

  return (
    <svg
      viewBox="0 0 400 40"
      preserveAspectRatio="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`wave-${difficulty}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colors.from} stopOpacity="0.3" />
          <stop offset="50%" stopColor={colors.to} stopOpacity="0.15" />
          <stop offset="100%" stopColor={colors.from} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path
        d="M0 20 Q50 5 100 20 T200 20 T300 20 T400 20 V40 H0 Z"
        fill={`url(#wave-${difficulty})`}
      >
        <animate
          attributeName="d"
          values="M0 20 Q50 5 100 20 T200 20 T300 20 T400 20 V40 H0 Z;M0 20 Q50 35 100 20 T200 20 T300 20 T400 20 V40 H0 Z;M0 20 Q50 5 100 20 T200 20 T300 20 T400 20 V40 H0 Z"
          dur="4s"
          repeatCount="indefinite"
        />
      </path>
      <path
        d="M0 25 Q75 10 150 25 T300 25 T400 25 V40 H0 Z"
        fill={`url(#wave-${difficulty})`}
        opacity="0.5"
      >
        <animate
          attributeName="d"
          values="M0 25 Q75 10 150 25 T300 25 T400 25 V40 H0 Z;M0 25 Q75 35 150 25 T300 25 T400 25 V40 H0 Z;M0 25 Q75 10 150 25 T300 25 T400 25 V40 H0 Z"
          dur="3s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
