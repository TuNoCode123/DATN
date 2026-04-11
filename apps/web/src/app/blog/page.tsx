import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Clock } from 'lucide-react';
import { Navbar, Footer, SectionBadge } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { BLOG_POSTS } from '@/content/blog-posts';

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

const categoryColors: Record<string, string> = {
  IELTS: 'bg-rose-100 text-rose-700',
  TOEIC: 'bg-sky-100 text-sky-700',
  HSK: 'bg-violet-100 text-violet-700',
  'AI Tools': 'bg-fuchsia-100 text-fuchsia-700',
  'Study Tips': 'bg-emerald-100 text-emerald-700',
};

export default function BlogIndexPage() {
  const posts = [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
        ])}
      />
      <Navbar />

      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
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
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="brutal-card p-6 block group"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border border-border-strong/20 ${
                    categoryColors[post.category] ?? 'bg-slate-100'
                  }`}
                >
                  {post.category}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {post.readingMinutes} min read
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(post.publishedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <h2 className="text-2xl font-extrabold text-foreground mb-2 group-hover:text-primary transition-colors">
                {post.title}
              </h2>
              <p className="text-slate-600 leading-relaxed text-sm mb-3">
                {post.description}
              </p>
              <div className="flex items-center gap-2 text-primary font-semibold text-sm group-hover:gap-3 transition-all">
                Read article <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
