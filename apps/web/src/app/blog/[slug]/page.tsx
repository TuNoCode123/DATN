import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, Calendar } from 'lucide-react';
import { Navbar, Footer } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildMetadata,
  breadcrumbSchema,
  articleSchema,
} from '@/lib/seo';
import { getBlogPost, getRelatedPosts } from '@/lib/blog-server';
import { PostRenderer } from '@/components/blog/post-renderer';

export const revalidate = 300;

type Params = { slug: string };

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
      <Navbar />

      {/* HEADER */}
      <article className="pt-32 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <nav className="text-xs text-slate-500 mb-6 flex gap-2 items-center">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-primary">Blog</Link>
            <span>/</span>
            <span className="text-foreground font-semibold truncate">
              {post.title}
            </span>
          </nav>

          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((t) => (
              <Link
                key={t.id}
                href={`/blog/tag/${t.slug}`}
                className="inline-block text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground border border-teal-200"
              >
                {t.name}
              </Link>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground mb-4 leading-[1.15]">
            {post.title}
          </h1>

          <p className="text-lg text-slate-600 mb-6 leading-relaxed">
            {post.excerpt}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mb-8 pb-8 border-b-2 border-border">
            {post.publishedAt && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(post.publishedAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
            <span>by {post.author.displayName ?? 'NEU Study Editorial'}</span>
          </div>

          {post.thumbnailUrl && (
            <div className="relative w-full aspect-[16/9] mb-8 overflow-hidden rounded-lg border-2 border-border">
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

          <PostRenderer html={post.contentHtml} />
        </div>
      </article>

      {/* CTA */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-3xl mx-auto brutal-card p-8 text-center bg-white">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-3">
            Put this into practice
          </h2>
          <p className="text-slate-600 mb-6 max-w-xl mx-auto">
            Start a free NEU Study account and apply these strategies on real
            practice tests with AI feedback.
          </p>
          <Link
            href="/register"
            className="brutal-btn bg-primary text-white px-7 py-3 text-sm inline-flex items-center gap-2"
          >
            Start Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* RELATED */}
      {related.length > 0 && (
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-6">
              Related reading
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="brutal-card p-5 group"
                >
                  {r.tags[0] && (
                    <span className="text-xs font-bold text-primary uppercase tracking-wide">
                      {r.tags[0].name}
                    </span>
                  )}
                  <h3 className="font-bold text-foreground mt-2 mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {r.title}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {r.excerpt}
                  </p>
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
