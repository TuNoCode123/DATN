import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowRight,
  ArrowLeft,
  Calendar,
  Clock,
  Eye,
  Tag,
} from 'lucide-react';
import { Navbar, Footer } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildMetadata,
  breadcrumbSchema,
  collectionPageSchema,
} from '@/lib/seo';
import { getBlogList } from '@/lib/blog-server';

export const revalidate = 300;

type Params = { tag: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { tag } = await params;
  const pretty = tag.replace(/-/g, ' ');
  return buildMetadata({
    title: `${pretty} — Blog`,
    description: `All blog posts tagged ${pretty}.`,
    path: `/blog/tag/${tag}`,
  });
}

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

export default async function BlogTagPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tag } = await params;
  const { data: posts } = await getBlogList({ tag, limit: 50 });
  if (posts.length === 0) notFound();

  const tagName =
    posts[0]?.tags.find((t) => t.slug === tag)?.name ??
    tag.replace(/-/g, ' ');

  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: tagName, path: `/blog/tag/${tag}` },
          ]),
          collectionPageSchema({
            path: `/blog/tag/${tag}`,
            title: `${tagName} — Blog`,
            description: `All blog posts tagged ${tagName}.`,
            items: posts.map((p) => ({
              name: p.title,
              path: `/blog/${p.slug}`,
            })),
          }),
        ]}
      />
      <Navbar />

      {/* Header */}
      <section className="pt-28 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary font-semibold mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All articles
          </Link>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border-2 border-border">
              <Tag className="w-4 h-4 text-secondary-foreground" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground">
              {tagName}
            </h1>
          </div>
          <p className="text-muted-foreground text-base">
            {posts.length} {posts.length === 1 ? 'article' : 'articles'}{' '}
            published
          </p>
        </div>
      </section>

      {/* Featured post from this tag */}
      {featured && (
        <section className="px-4 sm:px-6 lg:px-8 pb-8">
          <div className="max-w-5xl mx-auto">
            <Link
              href={`/blog/${featured.slug}`}
              className="brutal-card overflow-hidden group flex flex-col sm:flex-row"
            >
              {featured.thumbnailUrl && (
                <div className="relative w-full sm:w-80 h-56 sm:h-auto shrink-0 overflow-hidden">
                  <Image
                    src={featured.thumbnailUrl}
                    alt={featured.title}
                    fill
                    sizes="(min-width: 640px) 320px, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    priority
                  />
                </div>
              )}
              <div className="p-6 sm:p-8 flex-1 flex flex-col justify-center">
                <div className="flex gap-2 mb-3">
                  {featured.tags.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className="text-[10px] font-bold uppercase tracking-wide text-primary"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-3 leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {featured.title}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-3">
                  {featured.excerpt}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(featured.publishedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {estimateReadTime(featured.excerpt)} min read
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {featured.viewCount.toLocaleString()}
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Grid feed */}
      {rest.length > 0 && (
        <section className="pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {rest.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="brutal-card overflow-hidden group flex flex-col"
                >
                  {post.thumbnailUrl && (
                    <div className="relative w-full aspect-[16/9] overflow-hidden">
                      <Image
                        src={post.thumbnailUrl}
                        alt={post.title}
                        fill
                        sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"
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
                    <p className="text-muted-foreground text-xs leading-relaxed mb-3 line-clamp-2">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(post.publishedAt)}
                      </span>
                      <span className="flex items-center gap-1 text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        Read <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
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
