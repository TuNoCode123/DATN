'use client';

import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { LOTTIE } from '@/lib/feedback';

interface LoadingLottieProps {
  message?: string;
  size?: number;
  className?: string;
}

export function LoadingLottie({
  message = 'Loading...',
  size = 180,
  className = '',
}: LoadingLottieProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <div style={{ width: size, height: size }}>
        <DotLottieReact src={LOTTIE.loading} autoplay loop />
      </div>
      {message && (
        <p className="text-sm font-semibold text-slate-500 tracking-wide">{message}</p>
      )}
    </div>
  );
}
