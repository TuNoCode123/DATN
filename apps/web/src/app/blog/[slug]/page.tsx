import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Calendar,
  Clock,
  ChevronRight,
  User,
  Sparkles,
  BookOpen,
  Share2,
  Bookmark,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { Navbar, Footer } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildMetadata,
  breadcrumbSchema,
  articleSchema,
} from '@/lib/seo';
import { getBlogPost, getRelatedPosts } from '@/lib/blog-server';
import { PostRenderer } from '@/components/blog/post-renderer';
import { ReadingProgress } from '@/components/blog/reading-progress';
import { TableOfContents } from '@/components/blog/table-of-contents';
import { BlogCta } from '@/components/blog/blog-cta';

export const revalidate = 300;

type Params = { slug: string };

function estimateReadTime(html: string): number {
  const text = html.replace(/<[^>]+>/g, '');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return {};

  return buildMetadata({
    title: post.metaTitle ?? post.title,
    description: post.metaDescription ?? post.excerpt,
    path: `/blog/${post.slug}`,
    keywords: post.tags.map((t) => t.name),
    type: 'article',
    publishedTime: post.publishedAt ?? undefined,
    modifiedTime: post.updatedAt,
    ogImage: post.thumbnailUrl ?? undefined,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  const related = await getRelatedPosts(slug);
  const readTime = estimateReadTime(post.contentHtml);

  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
          articleSchema({
            title: post.title,
            description: post.metaDescription ?? post.excerpt,
            path: `/blog/${post.slug}`,
            datePublished: post.publishedAt ?? post.createdAt,
            dateModified: post.updatedAt,
            author: post.author.displayName ?? undefined,
            image: post.thumbnailUrl ?? undefined,
          }),
        ]}
      />
      <ReadingProgress />
      <Navbar />

      {/* ── Hero header ── */}
      <header className="pt-28 pb-0 bg-cream relative overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-8">
            <Link href="/" className="hover:text-primary transition-colors">
              Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/blog" className="hover:text-primary transition-colors">
              Blog
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium truncate max-w-[300px]">
              {post.title}
            </span>
          </nav>

          {/* Tag chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {post.tags.map((t) => (
              <Link
                key={t.id}
                href={`/blog/tag/${t.slug}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full border-2 border-foreground bg-secondary text-secondary-foreground hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
              >
                <Tag className="w-3 h-3" />
                {t.name}
              </Link>
            ))}
          </div>

          {/* Title */}
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-foreground leading-[1.15] tracking-tight mb-5 max-w-3xl">
            {post.title}
          </h1>

          {/* Excerpt */}
          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mb-8">
            {post.excerpt}
          </p>

          {/* Author card + meta chips */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 pb-8 border-b-[2.5px] border-foreground/10">
            {/* Author info */}
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full bg-primary border-2 border-foreground flex items-center justify-center text-white font-bold text-sm shadow-[2px_2px_0px_var(--foreground)]">
                {(post.author.displayName ?? 'N')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {post.author.displayName ?? 'NEU Study Editorial'}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  {post.publishedAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(post.publishedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {readTime} min read
                  </span>
                </div>
              </div>
            </div>

            {/* Meta chips + actions */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-white border-2 border-foreground px-3 py-1.5 rounded-full shadow-[2px_2px_0px_var(--foreground)]">
                <BookOpen className="w-3.5 h-3.5" />
                {readTime} min
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary border-2 border-foreground px-3 py-1.5 rounded-full shadow-[2px_2px_0px_var(--foreground)]">
                <TrendingUp className="w-3.5 h-3.5" />
                {post.tags[0]?.name ?? 'Article'}
              </span>
              <button
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-foreground text-foreground hover:bg-secondary hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_var(--foreground)]"
                title="Share"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
              <button
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-foreground text-foreground hover:bg-amber-100 hover:-translate-y-0.5 transition-all shadow-[2px_2px_0px_var(--foreground)]"
                title="Bookmark"
              >
                <Bookmark className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Article body (two-column on desktop) ── */}
      <article className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="lg:grid lg:grid-cols-[minmax(0,720px)_1fr] lg:gap-16">
          {/* Main content column */}
          <div className="min-w-0">
            {/* Featured image */}
            {post.thumbnailUrl && (
              <div className="relative w-full aspect-[16/9] mb-10 overflow-hidden rounded-2xl border-[2.5px] border-foreground shadow-[4px_6px_0px_var(--foreground)]">
                <Image
                  src={post.thumbnailUrl}
                  alt={post.title}
                  fill
                  unoptimized
                  className="object-cover"
                  priority
                />
              </div>
            )}

            {/* Prose content */}
            <PostRenderer html={post.contentHtml} />

            {/* Article footer tags */}
            <div className="mt-14 pt-8 border-t-[2.5px] border-foreground/10">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Topics
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((t) => (
                  <Link
                    key={t.id}
                    href={`/blog/tag/${t.slug}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full border-2 border-foreground bg-secondary text-secondary-foreground hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
                  >
                    <Tag className="w-3 h-3" />
                    {t.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar — TOC + mini CTA */}
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-8">
              <TableOfContents />

              {/* Mini sidebar CTA */}
              <div className="brutal-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-foreground">
                    Practice with AI
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Apply what you learned with real practice tests and instant AI
                  feedback.
                </p>
                <Link
                  href="/tests"
                  className="brutal-btn-fill text-xs px-4 py-2 inline-flex items-center gap-1.5"
                >
                  Browse tests <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </article>

      {/* ── CTA section (hidden when logged in) ── */}
      <BlogCta />

      {/* ── Related articles ── */}
      {related.length > 0 && (
        <section className="py-16 px-4 sm:px-6 lg:px-8 border-t-[2.5px] border-foreground/10">
          <div className="max-w-[1200px] mx-auto">
            <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-foreground mb-2">
              Continue reading
            </h2>
            <p className="text-muted-foreground mb-8">
              More articles on similar topics
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="group brutal-card p-6"
                >
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {r.tags.slice(0, 2).map((t) => (
                        <span
                          key={t.id ?? t.name}
                          className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-primary bg-secondary border border-foreground/20 px-2.5 py-0.5 rounded-full"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <h3 className="font-heading font-bold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                    {r.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {r.excerpt}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    Read more <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
