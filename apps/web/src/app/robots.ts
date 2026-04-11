import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [
          '/api/',
          // Admin console
          '/admin-dashboard',
          '/admin-analytics',
          '/admin-tests',
          '/admin-questions',
          '/admin-users',
          '/admin-results',
          '/admin-live-exams',
          '/admin-pronunciation-topics',
          '/admin-translation-topics',
          '/admin-credits',
          '/admin-settings',
          '/admin-import',
          // Private user areas
          '/dashboard',
          '/credits',
          '/chat',
          // Auth callback / error pages
          '/auth/',
          '/unauthorized',
          // Login is noindex via metadata; also block here as belt-and-braces
          '/login',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
