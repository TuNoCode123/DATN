// Server-side fetch helpers for the blog. Used by RSC pages and the sitemap.
// Uses plain fetch with Next.js ISR (`revalidate`) so the public blog stays
// static-fast but picks up edits ~5 minutes after publishing.

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export type BlogAuthor = {
  id: string;
  displayName: string | null;
  email: string;
};

export type BlogTag = {
  id: string;
  name: string;
  slug: string;
};

export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  thumbnailUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED';
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  author: BlogAuthor;
  tags: BlogTag[];
};

export type BlogPost = BlogPostSummary & {
  contentHtml: string;
  metaTitle: string | null;
  metaDescription: string | null;
};

export type BlogListResponse = {
  data: BlogPostSummary[];
  total: number;
  page: number;
  limit: number;
};

const REVALIDATE_SECONDS = 300;

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getBlogList(params: {
  page?: number;
  limit?: number;
  tag?: string;
  search?: string;
}): Promise<BlogListResponse> {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  if (params.tag) search.set('tag', params.tag);
  if (params.search) search.set('search', params.search);
  const qs = search.toString();
  const result = await fetchJson<BlogListResponse>(
    `/blog${qs ? `?${qs}` : ''}`,
  );
  return result ?? { data: [], total: 0, page: 1, limit: params.limit ?? 12 };
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  return fetchJson<BlogPost>(`/blog/${encodeURIComponent(slug)}`);
}

export async function getRelatedPosts(slug: string): Promise<BlogPostSummary[]> {
  const result = await fetchJson<BlogPostSummary[]>(
    `/blog/${encodeURIComponent(slug)}/related`,
  );
  return result ?? [];
}

export async function getBlogSitemap(): Promise<
  { slug: string; updatedAt: string }[]
> {
  const result = await fetchJson<{ slug: string; updatedAt: string }[]>(
    `/blog/sitemap`,
  );
  return result ?? [];
}
