'use client';

import { useEffect, useState } from 'react';

interface ScoreGaugeProps {
  score: number; // 0-100
  size?: number;
  label?: string;
  status?: 'master' | 'good' | 'fair' | 'poor';
}

const STATUS_COLORS = {
  master: { start: '#10B981', end: '#059669', bg: 'text-emerald-600' },
  good: { start: '#6366F1', end: '#4F46E5', bg: 'text-indigo-600' },
  fair: { start: '#F59E0B', end: '#D97706', bg: 'text-amber-600' },
  poor: { start: '#EF4444', end: '#DC2626', bg: 'text-red-600' },
};

export function ScoreGauge({ score, size = 140, label, status = 'good' }: ScoreGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // semicircle
  const offset = circumference - (animatedScore / 100) * circumference;
  const colors = STATUS_COLORS[status];
  const gradientId = `gauge-grad-${label || 'main'}`;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
        <svg width={size} height={size / 2 + 10} className="overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colors.start} />
              <stop offset="100%" stopColor={colors.end} />
            </linearGradient>
          </defs>
          {/* Background arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Score arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </svg>
        {/* Score number */}
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className={`text-3xl font-black ${colors.bg}`}>
            {animatedScore}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs font-bold uppercase text-gray-500 mt-1">{label}</span>
      )}
    </div>
  );
}
