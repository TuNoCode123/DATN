import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, Clock, Calendar } from 'lucide-react';
import { Navbar, Footer } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildMetadata,
  breadcrumbSchema,
  articleSchema,
} from '@/lib/seo';
import { BLOG_POSTS, getPostBySlug } from '@/content/blog-posts';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return buildMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    keywords: post.tags,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

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
            description: post.description,
            path: `/blog/${post.slug}`,
            datePublished: post.publishedAt,
            dateModified: post.updatedAt,
            author: post.author,
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
              {post.category}
            </span>
          </nav>

          <span className="inline-block text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground border border-teal-200 mb-4">
            {post.category}
          </span>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground mb-4 leading-[1.15]">
            {post.title}
          </h1>

          <p className="text-lg text-slate-600 mb-6 leading-relaxed">
            {post.description}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mb-8 pb-8 border-b-2 border-border">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {post.readingMinutes} min read
            </span>
            <span>by {post.author}</span>
          </div>

          <div className="prose prose-slate max-w-none">
            {post.content.map((section) => (
              <section key={section.heading} className="mb-8">
                <h2 className="text-2xl font-extrabold text-foreground mb-3">
                  {section.heading}
                </h2>
                {section.body.map((p, i) => (
                  <p
                    key={i}
                    className="text-slate-700 leading-relaxed mb-3 text-base"
                  >
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t-2 border-border">
            {post.tags.map((t) => (
              <span
                key={t}
                className="text-xs font-semibold text-slate-600 bg-slate-100 border border-border rounded-full px-3 py-1"
              >
                #{t}
              </span>
            ))}
          </div>
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
                  <span className="text-xs font-bold text-primary uppercase tracking-wide">
                    {r.category}
                  </span>
                  <h3 className="font-bold text-foreground mt-2 mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {r.title}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {r.description}
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
