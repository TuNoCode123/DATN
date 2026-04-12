import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { Navbar, Footer, SectionBadge } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { getBlogList } from '@/lib/blog-server';

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

export default async function BlogIndexPage() {
  const { data: posts } = await getBlogList({ page: 1, limit: 24 });

  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
        ])}
      />
      <Navbar />

      <section className="pt-32 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <SectionBadge text="Blog" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground mt-4 mb-6 leading-[1.1]">
            Language Exam{' '}
            <span className="text-primary italic">Strategies</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Evergreen guides for IELTS, TOEIC, and HSK — written by people who
            actually took the tests.
          </p>
        </div>
      </section>

      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {posts.length === 0 && (
            <div className="brutal-card p-10 text-center text-slate-500">
              No posts published yet — check back soon.
            </div>
          )}

          {posts.map((post) => (
            <article key={post.slug} className="brutal-card p-6 sm:p-7 group">
              <div className="flex flex-col sm:flex-row gap-5">
                {post.thumbnailUrl && (
                  <Link
                    href={`/blog/${post.slug}`}
                    className="relative w-full sm:w-40 h-40 sm:h-32 shrink-0 overflow-hidden rounded-md border-2 border-border"
                  >
                    <Image
                      src={post.thumbnailUrl}
                      alt={post.title}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </Link>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {post.tags.slice(0, 3).map((t) => (
                      <Link
                        key={t.id}
                        href={`/blog/tag/${t.slug}`}
                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-secondary text-secondary-foreground border border-teal-200"
                      >
                        {t.name}
                      </Link>
                    ))}
                    {post.publishedAt && (
                      <span className="text-xs text-slate-400">
                        {new Date(post.publishedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-extrabold text-foreground mb-2 line-clamp-2">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="hover:text-primary transition-colors"
                    >
                      {post.title}
                    </Link>
                  </h2>
                  <p className="text-slate-600 leading-relaxed text-sm mb-3 line-clamp-2">
                    {post.excerpt}
                  </p>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="inline-flex items-center gap-2 text-primary font-semibold text-sm hover:gap-3 transition-all"
                  >
                    Read article <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
