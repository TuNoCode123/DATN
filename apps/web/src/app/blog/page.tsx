import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  ArrowRight,
  Calendar,
  Clock,
  Eye,
  TrendingUp,
  Flame,
  BookOpen,
} from 'lucide-react';
import { Navbar, Footer } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata, breadcrumbSchema, blogSchema } from '@/lib/seo';
import { getBlogList, type BlogPostSummary, type BlogTag } from '@/lib/blog-server';
import { BlogControls } from '@/components/blog/blog-controls';
import { SidebarTags } from '@/components/blog/sidebar-tags';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: 'Language Exam Blog — IELTS, TOEIC, HSK Tips & Strategies',
  description:
    'Evergreen guides, study plans, and exam strategies for IELTS, TOEIC, HSK, and AI-powered language learning — written for students aiming at the top bands.',
  path: '/blog',
  keywords: [
    'ielts blog',
    'toeic tips',
    'hsk guide',
    'language learning blog',
    'exam strategy',
  ],
});

function estimateReadTime(excerpt: string): number {
  return Math.max(3, Math.ceil(excerpt.split(/\s+/).length / 40));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type SearchParams = { tag?: string; sort?: string; search?: string };

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeTag = params.tag ?? '';
  const sort = params.sort ?? 'latest';
  const search = params.search ?? '';

  const { data: allPosts } = await getBlogList({
    page: 1,
    limit: 50,
    tag: activeTag || undefined,
    search: search || undefined,
  });

  const hasFilters = !!activeTag || !!search;

  const posts =
    sort === 'popular'
      ? [...allPosts].sort((a, b) => b.viewCount - a.viewCount)
      : allPosts;

  const featured = !hasFilters ? posts[0] : null;
  const secondaryFeatured = !hasFilters ? posts.slice(1, 3) : [];
  const feedPosts = hasFilters ? posts : posts.slice(3);

  const trending = [...allPosts]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5);

  const allTags = Array.from(
    new Map(
      allPosts.flatMap((p) => p.tags.map((t) => [t.slug, t] as const)),
    ).values(),
  );

  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
          ]),
          blogSchema({
            path: '/blog',
            title: 'Language Exam Blog',
            description:
              'Evergreen guides, study plans, and exam strategies for IELTS, TOEIC, and HSK.',
            posts: allPosts.slice(0, 20).map((p) => ({
              title: p.title,
              path: `/blog/${p.slug}`,
              datePublished: p.publishedAt,
            })),
          }),
        ]}
      />
      <Navbar />

      {/* ══════════════ HERO ══════════════ */}
      <section className="pt-28 pb-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full border-2 border-border mb-6">
            <BookOpen className="w-3.5 h-3.5" />
            Blog
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground leading-[1.08] mb-4">
            Language Exam{' '}
            <span className="text-primary italic">Strategies</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Evergreen guides for IELTS, TOEIC, and HSK — written by people who
            actually took the tests.
          </p>
        </div>
      </section>

      {/* ══════════════ FEATURED ══════════════ */}
      {featured && (
        <section className="pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-2 mb-5">
              <Flame className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-foreground">
                Featured
              </span>
            </div>

            <div className="grid lg:grid-cols-5 gap-5">
              <FeaturedCard post={featured} />
              <div className="lg:col-span-2 flex flex-col gap-5">
                {secondaryFeatured.map((post) => (
                  <SecondaryCard key={post.slug} post={post} />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════ CONTROLS (client) ══════════════ */}
      <section className="px-4 sm:px-6 lg:px-8 pb-4">
        <div className="max-w-6xl mx-auto">
          <Suspense>
            <BlogControls />
          </Suspense>
        </div>
      </section>

      {/* ══════════════ FEED + SIDEBAR ══════════════ */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Feed */}
            <div className="lg:col-span-2 space-y-5">
              {hasFilters && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">
                      {feedPosts.length}
                    </span>{' '}
                    {feedPosts.length === 1 ? 'article' : 'articles'} found
                  </p>
                  <Link
                    href="/blog"
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    Clear filters
                  </Link>
                </div>
              )}

              {feedPosts.length === 0 && (
                <div className="brutal-card p-12 text-center">
                  <p className="text-muted-foreground text-sm">
                    No articles match your filters. Try a different category or
                    search term.
                  </p>
                </div>
              )}

              {feedPosts.map((post) => (
                <ArticleCard key={post.slug} post={post} />
              ))}
            </div>

            {/* Sidebar */}
            <aside className="space-y-6 hidden lg:block">
              <TrendingSidebar posts={trending} />

              <div className="brutal-card p-5">
                <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wide mb-4">
                  Popular Tags
                </h3>
                <Suspense>
                  <SidebarTags tags={allTags} />
                </Suspense>
              </div>

              <div className="brutal-card p-5 bg-secondary/30">
                <h3 className="font-extrabold text-foreground text-base mb-2">
                  Never miss a guide
                </h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Get weekly exam tips, practice strategies, and study plans
                  delivered to your inbox.
                </p>
                <Link
                  href="/register"
                  className="brutal-btn-fill px-5 py-2.5 text-sm inline-flex items-center gap-2 w-full justify-center"
                >
                  Join Free <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/* ─── Server sub-components ─── */

function FeaturedCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="lg:col-span-3 brutal-card overflow-hidden group flex flex-col"
    >
      {post.thumbnailUrl && (
        <div className="relative w-full aspect-[16/9] overflow-hidden">
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
            sizes="(min-width: 1024px) 700px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-4 left-4 flex gap-2">
            {post.tags.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-white/90 text-foreground backdrop-blur-sm"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="p-6 flex-1 flex flex-col">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-3 leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {post.title}
        </h2>
        <p className="text-muted-foreground leading-relaxed text-sm mb-4 line-clamp-3 flex-1">
          {post.excerpt}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(post.publishedAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {estimateReadTime(post.excerpt)} min read
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {post.viewCount.toLocaleString()}
          </span>
        </div>
      </div>
    </Link>
  );
}

function SecondaryCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="brutal-card overflow-hidden group flex-1 flex flex-col"
    >
      {post.thumbnailUrl && (
        <div className="relative w-full aspect-[2/1] overflow-hidden">
          <Image
            src={post.thumbnailUrl}
            alt={post.title}
            fill
            sizes="(min-width: 1024px) 400px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex gap-2 mb-2">
          {post.tags.slice(0, 2).map((t) => (
            <span
              key={t.id}
              className="text-[10px] font-bold uppercase tracking-wide text-primary"
            >
              {t.name}
            </span>
          ))}
        </div>
        <h3 className="text-lg font-extrabold text-foreground mb-2 leading-snug group-hover:text-primary transition-colors line-clamp-2 flex-1">
          {post.title}
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(post.publishedAt)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {estimateReadTime(post.excerpt)} min read
          </span>
        </div>
      </div>
    </Link>
  );
}

function ArticleCard({ post }: { post: BlogPostSummary }) {
  return (
    <article className="brutal-card overflow-hidden group">
      <div className="flex flex-col sm:flex-row">
        {post.thumbnailUrl && (
          <Link
            href={`/blog/${post.slug}`}
            className="relative w-full sm:w-52 h-48 sm:h-auto shrink-0 overflow-hidden"
          >
            <Image
              src={post.thumbnailUrl}
              alt={post.title}
              fill
              sizes="(min-width: 640px) 208px, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </Link>
        )}
        <div className="p-5 sm:p-6 flex-1 min-w-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {post.tags.slice(0, 3).map((t) => (
              <Link
                key={t.id}
                href={`/blog/tag/${t.slug}`}
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground hover:bg-primary hover:text-white transition-colors"
              >
                {t.name}
              </Link>
            ))}
          </div>
          <h2 className="text-xl font-extrabold text-foreground mb-2 leading-snug line-clamp-2">
            <Link
              href={`/blog/${post.slug}`}
              className="hover:text-primary transition-colors"
            >
              {post.title}
            </Link>
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2 flex-1">
            {post.excerpt}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(post.publishedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {estimateReadTime(post.excerpt)} min
              </span>
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {post.viewCount.toLocaleString()}
              </span>
            </div>
            <Link
              href={`/blog/${post.slug}`}
              className="text-primary text-xs font-semibold inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Read <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function TrendingSidebar({ posts }: { posts: BlogPostSummary[] }) {
  return (
    <div className="brutal-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wide">
          Trending
        </h3>
      </div>
      <ol className="space-y-3">
        {posts.map((post, i) => (
          <li key={post.slug} className="flex gap-3 group">
            <span className="text-2xl font-extrabold text-border leading-none select-none">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0">
              <Link
                href={`/blog/${post.slug}`}
                className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug"
              >
                {post.title}
              </Link>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {post.viewCount}
                </span>
                <span>·</span>
                <span>{estimateReadTime(post.excerpt)} min</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
