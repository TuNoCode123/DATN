'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import type { BlogTag } from '@/lib/blog-server';

export function SidebarTags({ tags }: { tags: BlogTag[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const activeTag = searchParams.get('tag') ?? '';

  function toggleTag(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (activeTag === slug) params.delete('tag');
    else params.set('tag', slug);
    params.delete('page');
    startTransition(() => {
      router.push(`/blog?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <button
          key={tag.slug}
          onClick={() => toggleTag(tag.slug)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all ${
            activeTag === tag.slug
              ? 'bg-foreground text-white border-foreground'
              : 'bg-white text-muted-foreground border-border hover:border-foreground hover:text-foreground'
          }`}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
