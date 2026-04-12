'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { Search } from 'lucide-react';

const CATEGORY_TABS = [
  { label: 'All', slug: '' },
  { label: 'IELTS', slug: 'ielts' },
  { label: 'TOEIC', slug: 'toeic' },
  { label: 'HSK', slug: 'hsk' },
  { label: 'Reading', slug: 'reading' },
  { label: 'Strategy', slug: 'strategy' },
  { label: 'Practice', slug: 'practice' },
];

export function BlogControls() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeTag = searchParams.get('tag') ?? '';
  const sort = searchParams.get('sort') ?? 'latest';
  const [searchInput, setSearchInput] = useState(
    searchParams.get('search') ?? '',
  );

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      params.delete('page');
      startTransition(() => {
        router.push(`/blog?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  return (
    <div className="border-b-2 border-border pb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      {/* Category tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {CATEGORY_TABS.map((tab) => {
          const isActive = tab.slug === activeTag;
          return (
            <button
              key={tab.label}
              onClick={() => updateParams({ tag: tab.slug })}
              className={`
                flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold
                whitespace-nowrap transition-all duration-200 border-2
                ${
                  isActive
                    ? 'bg-foreground text-white border-foreground shadow-[2px_2px_0px_var(--shadow-brutal)]'
                    : 'bg-white text-muted-foreground border-transparent hover:border-border hover:bg-muted'
                }
              `}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ search: searchInput.trim() });
          }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search articles..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => updateParams({ search: searchInput.trim() })}
            className="pl-9 pr-4 py-2 text-sm bg-white border-2 border-border rounded-full
              focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
              w-48 sm:w-56 transition-all placeholder:text-muted-foreground"
          />
        </form>
        <div className="flex rounded-full border-2 border-border overflow-hidden bg-white">
          <button
            onClick={() => updateParams({ sort: '' })}
            className={`px-3 py-2 text-xs font-semibold transition-colors ${
              sort === 'latest'
                ? 'bg-foreground text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Latest
          </button>
          <button
            onClick={() => updateParams({ sort: 'popular' })}
            className={`px-3 py-2 text-xs font-semibold transition-colors ${
              sort === 'popular'
                ? 'bg-foreground text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Popular
          </button>
        </div>
      </div>
    </div>
  );
}
