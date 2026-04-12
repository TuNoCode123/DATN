import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, BlogPostStatus } from '@prisma/client';
import * as sanitizeHtml from 'sanitize-html';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';
import { ListBlogPostsDto } from './dto/list-blog-posts.dto';

const POST_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  thumbnailUrl: true,
  status: true,
  publishedAt: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, displayName: true, email: true } },
  tags: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.BlogPostSelect;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'em', 'u', 's', 'sub', 'sup', 'mark',
    'code', 'pre', 'blockquote',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    span: ['style', 'class'],
    div: ['style', 'class', 'data-cta', 'data-test-slug', 'data-href', 'data-label'],
    th: ['colspan', 'rowspan', 'style'],
    td: ['colspan', 'rowspan', 'style'],
    table: ['style'],
    h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'],
    p: ['style'],
    '*': ['class'],
  },
  allowedStyles: {
    '*': {
      'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^rgba\(/],
      'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^rgba\(/],
      'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      'font-weight': [/^\d+$/, /^bold$/, /^normal$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener nofollow', target: '_blank' }, true),
  },
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 200) || 'post';
}

@Injectable()
export class BlogService {
  constructor(private prisma: PrismaService) {}

  // ── Public reads ─────────────────────────────────────────

  async listPublic(filters: ListBlogPostsDto) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 12, 50);
    const skip = (page - 1) * limit;

    const where: Prisma.BlogPostWhereInput = { status: 'PUBLISHED' };
    if (filters.tag) {
      where.tags = { some: { slug: filters.tag } };
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { excerpt: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        select: POST_LIST_SELECT,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getPublicBySlug(slug: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      include: {
        author: { select: { id: true, displayName: true, email: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!post || post.status !== 'PUBLISHED') {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  async getRelated(slug: string, limit = 3) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      select: { id: true, tags: { select: { id: true } } },
    });
    if (!post) return [];
    const tagIds = post.tags.map((t) => t.id);
    if (tagIds.length === 0) {
      return this.prisma.blogPost.findMany({
        where: { status: 'PUBLISHED', id: { not: post.id } },
        select: POST_LIST_SELECT,
        orderBy: { publishedAt: 'desc' },
        take: limit,
      });
    }
    return this.prisma.blogPost.findMany({
      where: {
        status: 'PUBLISHED',
        id: { not: post.id },
        tags: { some: { id: { in: tagIds } } },
      },
      select: POST_LIST_SELECT,
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  }

  async incrementView(slug: string) {
    await this.prisma.blogPost
      .update({
        where: { slug },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => undefined); // swallow — fire-and-forget
    return { ok: true };
  }

  async listSlugsForSitemap() {
    return this.prisma.blogPost.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  // ── Admin ────────────────────────────────────────────────

  async listAdmin(filters: ListBlogPostsDto) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.BlogPostWhereInput = {};
    if (filters.status) where.status = filters.status as BlogPostStatus;
    if (filters.tag) where.tags = { some: { slug: filters.tag } };
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { slug: { contains: filters.search, mode: 'insensitive' } },
        { excerpt: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        select: POST_LIST_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getAdminById(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, displayName: true, email: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async create(authorId: string, dto: CreateBlogPostDto) {
    const slug = await this.resolveSlug(dto.slug || dto.title);
    const cleanHtml = sanitizeHtml(dto.contentHtml, SANITIZE_OPTIONS);

    return this.prisma.blogPost.create({
      data: {
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        contentHtml: cleanHtml,
        contentJson: (dto.contentJson ?? {}) as Prisma.InputJsonValue,
        thumbnailUrl: dto.thumbnailUrl ?? null,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        authorId,
        tags: dto.tagIds?.length
          ? { connect: dto.tagIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        author: { select: { id: true, displayName: true, email: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Post not found');

    const data: Prisma.BlogPostUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt;
    if (dto.contentHtml !== undefined) {
      data.contentHtml = sanitizeHtml(dto.contentHtml, SANITIZE_OPTIONS);
    }
    if (dto.contentJson !== undefined) {
      data.contentJson = dto.contentJson as Prisma.InputJsonValue;
    }
    if (dto.thumbnailUrl !== undefined) data.thumbnailUrl = dto.thumbnailUrl;
    if (dto.metaTitle !== undefined) data.metaTitle = dto.metaTitle;
    if (dto.metaDescription !== undefined) data.metaDescription = dto.metaDescription;

    if (dto.slug && dto.slug !== existing.slug) {
      data.slug = await this.resolveSlug(dto.slug, id);
    }

    if (dto.tagIds !== undefined) {
      data.tags = { set: dto.tagIds.map((tagId) => ({ id: tagId })) };
    }

    return this.prisma.blogPost.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, displayName: true, email: true } },
        tags: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async togglePublish(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');

    if (post.status === 'PUBLISHED') {
      return this.prisma.blogPost.update({
        where: { id },
        data: { status: 'DRAFT' },
      });
    }
    return this.prisma.blogPost.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: post.publishedAt ?? new Date(),
      },
    });
  }

  async delete(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Helpers ──────────────────────────────────────────────

  private async resolveSlug(input: string, ignoreId?: string): Promise<string> {
    const base = slugify(input);
    let candidate = base;
    let suffix = 1;
    // Loop until candidate is free (or belongs to the post being updated)
    // Bounded by sanity guard.
    while (suffix < 50) {
      const existing = await this.prisma.blogPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === ignoreId) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    // Fallback
    return `${base}-${Date.now()}`;
  }
}
