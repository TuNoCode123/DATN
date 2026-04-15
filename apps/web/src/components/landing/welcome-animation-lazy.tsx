'use client';

import dynamic from 'next/dynamic';

const WelcomeAnimationInner = dynamic(
  () =>
    import('./welcome-animation').then((m) => m.WelcomeAnimation),
  {
    ssr: false,
    loading: () => <div className="w-full aspect-square" aria-hidden />,
  },
);

export function WelcomeAnimation() {
  return <WelcomeAnimationInner />;
}
