# Blog System Plan — IELTS AI Platform

> **Goal:** Add a blog tightly integrated with the existing admin dashboard to drive SEO traffic, build trust, and convert readers into test-takers / paying users.
>
> **Stack fit:** NestJS 11 + Prisma + Postgres (`apps/api`) and Next.js 16 App Router + Ant Design + Tailwind (`apps/web`). Editor reuses the existing **TipTap v3** setup at `apps/web/src/components/admin/tiptap-editor.tsx`.

---

## 1. Architecture

### 1.1 Data model (Prisma)

Add to `apps/api/prisma/schema.prisma`:

```prisma
model BlogPost {
  id              String     @id @default(cuid())
  slug            String     @unique
  title           String
  excerpt         String     // short summary; doubles as meta description fallback
  contentHtml     String     // sanitized HTML produced by TipTap
  contentJson     Json       // raw TipTap doc — needed to re-edit losslessly
  thumbnailUrl    String?
  status          PostStatus @default(DRAFT)

  // SEO
  metaTitle       String?
  metaDescription String?

  // Lifecycle
  publishedAt     DateTime?
  scheduledFor    DateTime?

  // Stats
  viewCount       Int        @default(0)

  authorId        String
  author          User       @relation(fields: [authorId], references: [id])

  tags            Tag[]      @relation("BlogPostTags") // reuse existing Tag model

  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@index([status, publishedAt])
}

enum PostStatus {
  DRAFT
  PUBLISHED
  SCHEDULED
}
```

Why store **both** `contentHtml` and `contentJson`:
- `contentHtml` is what the public page renders — fast, no client JS, SEO-safe.
- `contentJson` is what TipTap loads back into the editor without lossy round-trips.

**Reuse the existing `Tag` model** instead of inventing a separate "category" system. One taxonomy is enough at this stage.

### 1.2 URL structure

| Route | Purpose |
|---|---|
| `/blog` | Index — paginated list of published posts |
| `/blog/[slug]` | Single post |
| `/blog/tag/[tag]` | Tag archive |

- Flat URLs, no dates (so posts don't visually age).
- Slug auto-generated from title via `slugify`, editable in admin, unique at DB level.
- **Never change a published slug.** If renaming becomes necessary later, add a `redirect_from` field and a Next.js middleware redirect.

---

## 2. Admin Design

### 2.1 Routes (under existing `(admin)` group)

| Route | Purpose |
|---|---|
| `/admin-blog` | Posts list (AntD `Table`: title, status, tags, views, publishedAt, actions) |
| `/admin-blog/new` | Create post |
| `/admin-blog/[id]/edit` | Edit post |
| `/admin-blog/[id]/preview` | Live preview using the **same** public renderer |

Follow the existing convention of the `admin-` prefix to avoid Next.js route conflicts.

### 2.2 Backend module

Create `apps/api/src/blog/`:

```
blog/
├── blog.module.ts
├── blog.controller.ts        // public read endpoints
├── blog-admin.controller.ts  // admin CRUD, JWT + admin guard
├── blog.service.ts
└── dto/
    ├── create-post.dto.ts
    ├── update-post.dto.ts
    └── list-posts.dto.ts
```

Endpoints:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/blog` | public | Paginated list, `status=PUBLISHED` only |
| `GET` | `/api/blog/:slug` | public | Single post; increments `viewCount` |
| `GET` | `/api/blog/tag/:tag` | public | Posts by tag |
| `POST` | `/api/blog/:slug/view` | public | Fire-and-forget view ping (debounced client-side) |
| `GET` | `/api/admin/blog` | admin | All posts including drafts |
| `GET` | `/api/admin/blog/:id` | admin | Returns `contentJson` for editor reload |
| `POST` | `/api/admin/blog` | admin | Create |
| `PATCH` | `/api/admin/blog/:id` | admin | Update |
| `DELETE` | `/api/admin/blog/:id` | admin | Delete |

Wire `BlogModule` into `app.module.ts`.

### 2.3 Editor — TipTap (reuse existing component)

You already have `apps/web/src/components/admin/tiptap-editor.tsx` with StarterKit, tables, images, headings, lists, alignment, color/highlight, underline, code, hard-break. **Reuse it directly** — do not introduce a new editor.

Two small additions needed for blog use:

1. **Heading discipline.** The post `title` is the only `<h1>` on the page. Configure StarterKit so the editor's heading levels start at H2:
   ```ts
   StarterKit.configure({ heading: { levels: [2, 3, 4] } })
   ```
   In the toolbar, expose **only H2 / H3 / H4** for blog posts (you can pass a `mode="blog"` prop to the existing component, or fork a thin `tiptap-blog-editor.tsx` if it's cleaner than branching the toolbar).

2. **Sanitize on the server.** TipTap output is generally safe, but never trust the client. In `BlogService.create/update`, run the incoming HTML through **`sanitize-html`** with a strict allow-list before persisting:
   ```ts
   import sanitizeHtml from 'sanitize-html';
   const clean = sanitizeHtml(dto.contentHtml, {
     allowedTags: [
       'h2','h3','h4','p','strong','em','u','s','code','pre','blockquote',
       'ul','ol','li','a','img','hr','br','table','thead','tbody','tr','th','td','span'
     ],
     allowedAttributes: {
       a: ['href','title','rel','target'],
       img: ['src','alt','title','width','height','loading'],
       span: ['style'], // for color/highlight
       '*': ['class'],
     },
     allowedSchemes: ['http','https','mailto'],
     transformTags: {
       a: sanitizeHtml.simpleTransform('a', { rel: 'noopener', target: '_blank' }, true),
     },
   });
   ```
   Persist `clean` to `contentHtml`. Persist `contentJson` as-is (it's not rendered, just re-loaded into the editor).

3. **Image upload inside the editor.** Add an upload button next to the existing image controls that POSTs to your existing upload endpoint (or a new `/api/admin/upload/blog`) and inserts the returned URL via `editor.chain().focus().setImage({ src }).run()`.

### 2.4 Form layout (admin edit page)

Single-page AntD `Form`:

- **Left column (8/12)**: Title → Slug (auto-filled, editable) → TipTap editor → Excerpt
- **Right column (4/12)**: Status toggle, Publish/Schedule button, Thumbnail uploader, Tags multi-select, Meta title, Meta description, "Open preview" button
- Footer: Save draft / Publish

### 2.5 Preview

`/admin-blog/[id]/preview` renders using the **exact** public post template (just bypassing the `status=PUBLISHED` filter). One renderer, no drift.

### 2.6 What to skip in MVP

Comments, revision history, multi-author roles, i18n, AMP, RSS, full-text search, AI-suggested related posts, A/B-tested CTAs. Scheduled publish can ship as a tiny cron later (flip `SCHEDULED → PUBLISHED` when `scheduledFor <= now()`).

---

## 3. SEO System

This is where the actual ROI lives.

### 3.1 Per-post metadata — `app/blog/[slug]/page.tsx`

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.slug);
  const url = `https://yourdomain.com/blog/${post.slug}`;
  return {
    title: post.metaTitle ?? post.title,
    description: post.metaDescription ?? post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      title: post.metaTitle ?? post.title,
      description: post.metaDescription ?? post.excerpt,
      url,
      type: 'article',
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      images: post.thumbnailUrl ? [{ url: post.thumbnailUrl }] : [],
    },
    twitter: { card: 'summary_large_image' },
  };
}
```

### 3.2 Heading structure

- `title` is the page's only `<h1>` (rendered by the layout, not the editor).
- TipTap toolbar exposes H2 / H3 / H4 only (see §2.3).
- Use `rehype-slug`-style behavior on the rendered HTML: post-process `contentHtml` server-side to add `id` attributes to headings so anchor links and a future TOC just work.

### 3.3 JSON-LD structured data

Inject inside `app/blog/[slug]/page.tsx`:

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.metaDescription ?? post.excerpt,
      image: post.thumbnailUrl,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: { '@type': 'Person', name: post.author.name },
      mainEntityOfPage: `https://yourdomain.com/blog/${post.slug}`,
    }),
  }}
/>
```

Validate with Google's Rich Results Test before launch.

### 3.4 Sitemap — `app/sitemap.ts`

```ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await prisma.blogPost.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, updatedAt: true },
  });
  return [
    { url: 'https://yourdomain.com/blog', changeFrequency: 'daily', priority: 0.8 },
    ...posts.map((p) => ({
      url: `https://yourdomain.com/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
```

### 3.5 robots — `app/robots.ts`

```ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/blog', disallow: ['/admin-', '/api/admin'] }],
    sitemap: 'https://yourdomain.com/sitemap.xml',
  };
}
```

### 3.6 Internal linking strategy (the conversion engine)

1. **Auto-injected end-of-post CTA** in the public template — picks a relevant test based on post tags ("Try the IELTS Reading test mentioned in this post →").
2. **Inline CTA shortcodes.** Since TipTap stores HTML, define a small set of placeholder elements that the public renderer post-processes:
   - `<div data-cta="test" data-test-slug="ielts-reading-1"></div>` → rendered as a brutal-card test invitation
   - `<div data-cta="signup"></div>` → rendered as a signup prompt
   - Add a TipTap toolbar dropdown ("Insert CTA") that emits these nodes — keep it simple, no custom node-views needed.
3. **Related posts block** — bottom of every post, latest 3 posts sharing a tag. Boosts crawl depth and dwell time.
4. **Reverse links** — on existing test result pages, link to relevant blog posts ("Read: 5 mistakes that lower your IELTS Reading score"). This sends authority both directions.

---

## 4. Content Strategy — 12 Posts

Grouped by funnel stage, not just difficulty.

### Beginner / top-of-funnel (high volume, build trust)
| # | Title | Target keyword | CTA |
|---|---|---|---|
| 1 | What is IELTS? A complete beginner's guide (2026) | `what is ielts` | Free placement test |
| 2 | IELTS vs TOEIC: which English test should you take? | `ielts vs toeic` | Take both free samples |
| 3 | How long does it take to learn English fluently? | `how long to learn english` | Sign up for daily quizzes |
| 4 | 500 most common English words for beginners (with quiz) | `common english words` | Inline vocab quiz |

### Intermediate / mid-funnel (specific pain points)
| # | Title | Target keyword | CTA |
|---|---|---|---|
| 5 | 10 most common IELTS Reading mistakes (and how to fix them) | `ielts reading mistakes` | Take IELTS Reading test |
| 6 | IELTS Writing Task 2: band 6 vs band 8 sample comparison | `ielts writing task 2 sample` | AI essay scoring (upsell) |
| 7 | How to improve English listening in 30 days | `improve english listening` | Listening practice library |
| 8 | Phrasal verbs every B2 learner needs to know | `b2 phrasal verbs` | Phrasal verb quiz |
| 9 | How to score 7.0 in IELTS Speaking: real examiner tips | `ielts speaking 7.0` | AI speaking practice (upsell) |

### Advanced / bottom-funnel (high intent — these convert)
| # | Title | Target keyword | CTA |
|---|---|---|---|
| 10 | IELTS Academic vs General: which one do you need? | `ielts academic vs general` | Full mock test |
| 11 | **Free full-length IELTS mock test with band score** | `free ielts mock test` | **Direct test link — money page** |
| 12 | TOEIC 900+ strategy: how I went from 750 to 920 | `toeic 900 strategy` | TOEIC mock test + premium |

**Write post #11 first.** It's the highest-intent query in this set and the one most likely to pay back the build effort.

### Conversion patterns to bake into the public template

- **Inline test CTA** mid-post after teaching a concept ("Test yourself ↓")
- **End-of-post CTA card** auto-rendered, points to the most relevant test for the post's tags
- **Sticky sidebar on desktop** — "Take the free placement test"
- Skip exit-intent popups, paywalls, and newsletter modals at MVP stage

---

## 5. Tech Stack Decisions

| Concern | Choice | Why |
|---|---|---|
| DB | Postgres + Prisma (existing) | Already in place |
| Editor | **TipTap v3 (existing component)** | Already installed, already used elsewhere — zero new dependencies |
| Storage | `contentHtml` (sanitized) + `contentJson` | Fast public render + lossless re-edit |
| Sanitization | `sanitize-html` on the API server | Defense-in-depth, never trust the client |
| Images | Existing upload pipeline; Next `<Image>` for rendering | No new service |
| Rendering | **ISR**: `export const revalidate = 300` on `/blog/[slug]` | Static-fast, refreshes 5min after edits. SSG lacks freshness; SSR wastes DB hits |
| Cache invalidation | `revalidatePath('/blog/[slug]')` from admin save handler | Instant updates after publish |
| View count | Client `useEffect` POST `/api/blog/:slug/view`, debounced | Doesn't block render |
| Search | **Skip for MVP** — tag filter is enough until ~30 posts | YAGNI |

### Dependencies to add
- **API**: `sanitize-html` (+ `@types/sanitize-html`)
- **Web**: none — TipTap, AntD, Tailwind, slugify are already present (verify `slugify` or use a 5-line local helper)

---

## 6. MVP Plan — 3 Days

### Day 1 — Backend + data layer
- [ ] Add `BlogPost` model + `PostStatus` enum to `schema.prisma`
- [ ] Run migration: `npx prisma migrate dev --name add_blog`
- [ ] Create `apps/api/src/blog/` module with public + admin controllers, service, DTOs
- [ ] Install `sanitize-html`, wire into `BlogService.create/update`
- [ ] Add slug uniqueness handling (auto-suffix `-2`, `-3` on collision)
- [ ] Wire `BlogModule` into `app.module.ts`
- [ ] Seed 2 dummy posts in `prisma/seed.ts` to unblock frontend
- **Done when:** `curl http://localhost:4000/api/blog` returns the seeded posts

### Day 2 — Public blog (the SEO surface)
- [ ] `app/blog/page.tsx` — paginated index with thumbnails (ISR)
- [ ] `app/blog/[slug]/page.tsx` — post page: `generateMetadata`, JSON-LD, related posts block, ISR with `revalidate = 300`
- [ ] `app/blog/tag/[tag]/page.tsx` — tag archive
- [ ] `app/sitemap.ts` + `app/robots.ts`
- [ ] Public renderer that post-processes HTML: add heading IDs, transform `<div data-cta>` placeholders into real CTA cards
- [ ] Style with the existing neo-brutalist system (`brutal-card`, `brutal-btn-fill`)
- **Done when:** A seeded post renders at `/blog/[slug]` with valid OG tags + JSON-LD (verify in Google Rich Results Test)

### Day 3 — Admin + first real post
- [ ] `/admin-blog` list page (AntD `Table`)
- [ ] `/admin-blog/new` + `/admin-blog/[id]/edit` — AntD `Form` + reused `tiptap-editor.tsx` configured for blog mode (H2–H4 only)
- [ ] Thumbnail uploader (reuse existing upload endpoint)
- [ ] "Insert CTA" toolbar dropdown emitting `<div data-cta>` placeholders
- [ ] `/admin-blog/[id]/preview` — reuses public renderer
- [ ] Status toggle (Draft ↔ Published) as a single button; on publish, call `revalidatePath`
- [ ] Write + publish post #11 (*"Free full-length IELTS mock test with band score"*) — the money page
- [ ] Submit sitemap to Google Search Console
- **Done when:** You can write, preview, publish, and read a real post end-to-end, and Search Console has accepted the sitemap

---

## 7. Explicitly Out of Scope (for now)

Comments • post revisions / version history • scheduled publish cron • full-text search • view-count analytics dashboards • multi-author roles & permissions • i18n / translations • AMP • RSS feed • newsletter integration • AI-suggested related posts • A/B-tested CTAs • exit-intent modals.

Add these only when traffic data justifies the work.

---

## 8. File / Module Checklist

**API (`apps/api/`)**
- `prisma/schema.prisma` — add `BlogPost` + `PostStatus`
- `prisma/seed.ts` — add 2 seed posts
- `src/blog/blog.module.ts`
- `src/blog/blog.controller.ts` (public)
- `src/blog/blog-admin.controller.ts` (admin-guarded)
- `src/blog/blog.service.ts`
- `src/blog/dto/*.dto.ts`
- `src/app.module.ts` — register `BlogModule`

**Web (`apps/web/src/`)**
- `app/blog/page.tsx`
- `app/blog/[slug]/page.tsx`
- `app/blog/tag/[tag]/page.tsx`
- `app/sitemap.ts`
- `app/robots.ts`
- `app/(admin)/admin-blog/page.tsx`
- `app/(admin)/admin-blog/new/page.tsx`
- `app/(admin)/admin-blog/[id]/edit/page.tsx`
- `app/(admin)/admin-blog/[id]/preview/page.tsx`
- `components/blog/post-renderer.tsx` (HTML → React, transforms CTA placeholders)
- `components/blog/post-card.tsx`
- `components/blog/related-posts.tsx`
- `components/admin/tiptap-editor.tsx` — extend with `mode="blog"` (H2–H4 only) + "Insert CTA" dropdown
- `lib/blog-api.ts` — typed client wrappers
