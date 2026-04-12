import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { Navbar, Footer } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
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

  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
          { name: tagName, path: `/blog/tag/${tag}` },
        ])}
      />
      <Navbar />

      <section className="pt-32 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <nav className="text-xs text-slate-500 mb-4 flex gap-2 items-center">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-primary">Blog</Link>
            <span>/</span>
            <span className="text-foreground font-semibold">{tagName}</span>
          </nav>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-foreground mb-3">
            Posts tagged{' '}
            <span className="text-primary italic">{tagName}</span>
          </h1>
          <p className="text-slate-600">
            {posts.length} {posts.length === 1 ? 'post' : 'posts'} in this tag.
          </p>
        </div>
      </section>

      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="brutal-card p-6 sm:p-7 block group"
            >
              <div className="flex flex-col sm:flex-row gap-5">
                {post.thumbnailUrl && (
                  <div className="relative w-full sm:w-40 h-40 sm:h-32 shrink-0 overflow-hidden rounded-md border-2 border-border">
                    <Image
                      src={post.thumbnailUrl}
                      alt={post.title}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-extrabold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3 line-clamp-2">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center gap-2 text-primary font-semibold text-sm group-hover:gap-3 transition-all">
                    Read article <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
