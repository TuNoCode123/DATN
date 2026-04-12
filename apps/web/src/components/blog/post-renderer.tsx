// Renders sanitized TipTap HTML for the public blog. Performs two transforms:
//   1. Adds id slugs to <h2>/<h3>/<h4> for anchor links.
//   2. Replaces <div data-cta="…"> placeholders with React CTA cards.
// Everything else is rendered as-is via dangerouslySetInnerHTML on safe chunks.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

type Props = { html: string };

const HEADING_RE = /<(h[234])([^>]*)>([\s\S]*?)<\/\1>/g;
const CTA_RE =
  /<div\s+([^>]*?)data-cta=["']([^"']+)["']([^>]*?)\/?>(?:\s*<\/div>)?/g;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function getAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}=["']([^"']+)["']`));
  return m ? m[1] : null;
}

type Chunk =
  | { kind: 'html'; html: string }
  | { kind: 'cta'; ctaType: string; testSlug?: string; href?: string; label?: string };

function splitOnCtas(html: string): Chunk[] {
  const chunks: Chunk[] = [];
  let lastIndex = 0;
  CTA_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CTA_RE.exec(html))) {
    if (match.index > lastIndex) {
      chunks.push({ kind: 'html', html: html.slice(lastIndex, match.index) });
    }
    const allAttrs = `${match[1]} ${match[3]}`;
    chunks.push({
      kind: 'cta',
      ctaType: match[2],
      testSlug: getAttr(allAttrs, 'data-test-slug') ?? undefined,
      href: getAttr(allAttrs, 'data-href') ?? undefined,
      label: getAttr(allAttrs, 'data-label') ?? undefined,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < html.length) {
    chunks.push({ kind: 'html', html: html.slice(lastIndex) });
  }
  return chunks;
}

function addHeadingIds(html: string): string {
  return html.replace(HEADING_RE, (full, tag, attrs, inner) => {
    if (/\sid=/.test(attrs)) return full;
    const id = slugify(inner);
    if (!id) return full;
    return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
  });
}

function CtaCard({
  ctaType,
  testSlug,
  href,
  label,
}: {
  ctaType: string;
  testSlug?: string;
  href?: string;
  label?: string;
}) {
  const resolvedHref =
    href ??
    (ctaType === 'test'
      ? testSlug
        ? `/tests/${testSlug}`
        : '/tests'
      : ctaType === 'signup'
      ? '/register'
      : '/');
  const resolvedLabel =
    label ??
    (ctaType === 'test'
      ? 'Try this practice test'
      : ctaType === 'signup'
      ? 'Create your free account'
      : 'Learn more');
  const heading =
    ctaType === 'test'
      ? 'Put it into practice'
      : ctaType === 'signup'
      ? 'Ready to start?'
      : 'Try it out';
  const body =
    ctaType === 'test'
      ? 'Try the related practice test now and apply what you just read.'
      : ctaType === 'signup'
      ? 'Create a free account and unlock AI feedback on every attempt.'
      : '';

  return (
    <div className="not-prose my-8 brutal-card p-6 bg-white">
      <h3 className="text-xl font-extrabold text-foreground mb-2">{heading}</h3>
      {body && <p className="text-slate-600 mb-4">{body}</p>}
      <Link
        href={resolvedHref}
        className="brutal-btn bg-primary text-white px-5 py-2.5 text-sm inline-flex items-center gap-2"
      >
        {resolvedLabel} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

export function PostRenderer({ html }: Props) {
  const withIds = addHeadingIds(html);
  const chunks = splitOnCtas(withIds);

  return (
    <div className="prose prose-slate max-w-none prose-headings:font-extrabold prose-headings:text-foreground prose-a:text-primary prose-img:rounded-lg">
      {chunks.map((chunk, i) =>
        chunk.kind === 'html' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: chunk.html }} />
        ) : (
          <CtaCard
            key={i}
            ctaType={chunk.ctaType}
            testSlug={chunk.testSlug}
            href={chunk.href}
            label={chunk.label}
          />
        ),
      )}
    </div>
  );
}
