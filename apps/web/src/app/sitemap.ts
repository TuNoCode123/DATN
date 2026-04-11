import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { BLOG_POSTS } from '@/content/blog-posts';
import { HSK_LEVELS } from '@/content/hsk-levels';

// Bumped manually when static landing pages get a meaningful content update.
// Avoids reporting `new Date()` on every crawl, which Google ignores.
const STATIC_PAGES_LAST_UPDATED = new Date('2026-04-12');

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    // Homepage
    {
      url: `${SITE_URL}/`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    // Exam pillar pages (SEO landing)
    {
      url: `${SITE_URL}/ielts`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/toeic`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/hsk`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    // Real feature routes (auth-walled but indexable for branded queries)
    {
      url: `${SITE_URL}/tests`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/flashcards`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/pronunciation`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/translation`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/live`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    // Blog hub
    {
      url: `${SITE_URL}/blog`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    // Conversion page
    {
      url: `${SITE_URL}/register`,
      lastModified: STATIC_PAGES_LAST_UPDATED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ];

  const hskRoutes: MetadataRoute.Sitemap = HSK_LEVELS.map((l) => ({
    url: `${SITE_URL}/hsk/${l.level}`,
    lastModified: STATIC_PAGES_LAST_UPDATED,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...hskRoutes, ...blogRoutes];
}
