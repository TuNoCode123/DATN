'use client';

import Image from 'next/image';
import type { QuestionMedia } from '@/lib/live-exam-types';

/**
 * Renders an HTML prompt (produced by TiptapMiniEditor) with any
 * attached image/audio media below it. Shared between the player,
 * host and result views so every consumer treats prompts as HTML.
 */
export function PromptWithMedia({
  prompt,
  media,
  className = '',
  promptClassName = '',
}: {
  prompt: string;
  media?: QuestionMedia;
  className?: string;
  promptClassName?: string;
}) {
  return (
    <div className={className}>
      <div
        className={`prose max-w-none break-words ${promptClassName}`}
        dangerouslySetInnerHTML={{ __html: prompt }}
      />
      {media?.imageUrl && (
        <div className="mt-3 flex justify-center">
          <Image
            src={media.imageUrl}
            alt=""
            width={640}
            height={360}
            unoptimized
            className="max-h-72 w-auto rounded-lg border-[3px] border-black shadow-[4px_4px_0_0_#000] object-contain"
          />
        </div>
      )}
      {media?.audioUrl && (
        <div className="mt-3">
          <audio controls src={media.audioUrl} className="w-full" />
        </div>
      )}
    </div>
  );
}
