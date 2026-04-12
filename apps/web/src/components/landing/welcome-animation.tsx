'use client';

import { DotLottieReact } from '@lottiefiles/dotlottie-react';

export function WelcomeAnimation() {
  return (
    <DotLottieReact
      src="/Welcome.json"
      autoplay
      loop
      className="w-full h-auto scale-[1.6] origin-center"
    />
  );
}
