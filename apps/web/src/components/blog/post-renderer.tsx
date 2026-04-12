import Link from 'next/link';
import { ArrowRight, Target, UserPlus, Lightbulb } from 'lucide-react';

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
  | {
      kind: 'cta';
      ctaType: string;
      testSlug?: string;
      href?: string;
      label?: string;
    };

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

const CTA_CONFIG = {
  test: {
    icon: Target,
    heading: 'Put it into practice',
    body: 'Try the related practice test now and apply what you just read.',
    defaultLabel: 'Try this practice test',
  },
  signup: {
    icon: UserPlus,
    heading: 'Ready to start?',
    body: 'Create a free account and unlock AI feedback on every attempt.',
    defaultLabel: 'Create your free account',
  },
  default: {
    icon: Lightbulb,
    heading: 'Try it out',
    body: '',
    defaultLabel: 'Learn more',
  },
} as const;

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
  const config =
    CTA_CONFIG[ctaType as keyof typeof CTA_CONFIG] ?? CTA_CONFIG.default;
  const Icon = config.icon;

  const resolvedHref =
    href ??
    (ctaType === 'test'
      ? testSlug
        ? `/tests/${testSlug}`
        : '/tests'
      : ctaType === 'signup'
        ? '/register'
        : '/');

  const resolvedLabel = label ?? config.defaultLabel;

  return (
    <div className="not-prose my-10 brutal-card p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary border-2 border-foreground shadow-[2px_2px_0px_var(--foreground)] flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground mb-1">
            {config.heading}
          </h3>
          {config.body && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {config.body}
            </p>
          )}
          <Link
            href={resolvedHref}
            className="brutal-btn-fill text-sm px-5 py-2 inline-flex items-center gap-2"
          >
            {resolvedLabel} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PostRenderer({ html }: Props) {
  const withIds = addHeadingIds(html);
  const chunks = splitOnCtas(withIds);

  return (
    <div className="article-prose">
      {chunks.map((chunk, i) =>
        chunk.kind === 'html' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: chunk.html }} />
        ) : null,
      )}
    </div>
  );
}
