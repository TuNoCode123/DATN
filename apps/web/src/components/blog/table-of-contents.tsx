'use client';

import { useEffect, useState } from 'react';
import { List } from 'lucide-react';

type TocItem = { id: string; text: string; level: number };

export function TableOfContents() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const article = document.querySelector('article');
    if (!article) return;
    const headings = article.querySelectorAll('h2[id], h3[id]');
    const tocItems: TocItem[] = [];
    headings.forEach((h) => {
      tocItems.push({
        id: h.id,
        text: h.textContent?.trim() ?? '',
        level: h.tagName === 'H2' ? 2 : 3,
      });
    });
    setItems(tocItems);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    );
    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav className="brutal-card p-5">
      <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <List className="w-3.5 h-3.5" />
        On this page
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`
                block text-[13px] leading-snug py-1.5 border-l-[2.5px] transition-all duration-200
                ${item.level === 3 ? 'pl-5' : 'pl-3'}
                ${
                  activeId === item.id
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }
              `}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
