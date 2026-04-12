"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileUpload } from "@/components/admin/file-upload";
import { useQuery } from "@tanstack/react-query";
import { adminTagsApi } from "@/lib/admin-api";
import {
  useCreateBlogPost,
  useUpdateBlogPost,
} from "@/features/admin/hooks";
import type { AdminBlogPostInput } from "@/lib/admin-api";
import { ArrowLeft, Eye, Save, Sparkles } from "lucide-react";

// TipTap is heavy & client-only — load it lazily.
const TiptapEditor = dynamic(
  () => import("@/components/admin/tiptap-editor"),
  { ssr: false },
);

interface BlogPostFormProps {
  mode: "create" | "edit";
  initial?: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    contentHtml: string;
    thumbnailUrl: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    status: "DRAFT" | "PUBLISHED" | "SCHEDULED";
    tags: { id: string; name: string }[];
  };
}

interface TagOption {
  id: string;
  name: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 200);
}

export function BlogPostForm({ mode, initial }: BlogPostFormProps) {
  const router = useRouter();
  const createMut = useCreateBlogPost();
  const updateMut = useUpdateBlogPost();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [contentHtml, setContentHtml] = useState(initial?.contentHtml ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    initial?.thumbnailUrl ?? null,
  );
  const [metaTitle, setMetaTitle] = useState(initial?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    initial?.metaDescription ?? "",
  );
  const [tagIds, setTagIds] = useState<string[]>(
    initial?.tags.map((t) => t.id) ?? [],
  );

  // Auto-fill slug from title until the user types in the slug field manually
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  const { data: allTags } = useQuery<TagOption[]>({
    queryKey: ["admin-tags"],
    queryFn: () => adminTagsApi.getAll(),
  });

  function toggleTag(id: string) {
    setTagIds((curr) =>
      curr.includes(id) ? curr.filter((t) => t !== id) : [...curr, id],
    );
  }

  function buildPayload(): AdminBlogPostInput {
    return {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: excerpt.trim(),
      contentHtml,
      thumbnailUrl,
      metaTitle: metaTitle.trim() || undefined,
      metaDescription: metaDescription.trim() || undefined,
      tagIds,
    };
  }

  function validate(): string | null {
    if (!title.trim()) return "Title is required";
    if (title.trim().length < 3) return "Title is too short";
    if (!excerpt.trim()) return "Excerpt is required";
    if (!contentHtml || contentHtml === "<p></p>") return "Content is required";
    return null;
  }

  function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const payload = buildPayload();
    const onErr = (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save";
      toast.error(msg);
    };
    if (mode === "create") {
      createMut.mutate(payload, {
        onSuccess: (post: { id: string }) => {
          toast.success("Draft saved");
          router.push(`/admin-blog/${post.id}/edit`);
        },
        onError: onErr,
      });
    } else if (initial) {
      updateMut.mutate(
        { id: initial.id, data: payload },
        {
          onSuccess: () => toast.success("Saved"),
          onError: onErr,
        },
      );
    }
  }

  function insertCta(kind: "test" | "signup") {
    // Append a placeholder div the public renderer will transform into a CTA card.
    const placeholder =
      kind === "test"
        ? '<p></p><div data-cta="test" data-test-slug="ielts-academic-1"></div><p></p>'
        : '<p></p><div data-cta="signup"></div><p></p>';
    setContentHtml((curr) => (curr ?? "") + placeholder);
    toast.success(`${kind === "test" ? "Test" : "Signup"} CTA inserted`);
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin-blog">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">
            {mode === "create" ? "New Blog Post" : "Edit Post"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {mode === "edit" && initial && (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/admin-blog/${initial.id}/preview`}
                target="_blank"
              >
                <Eye className="h-4 w-4 mr-1" /> Preview
              </Link>
            </Button>
          )}
          <Button onClick={handleSave} disabled={isPending} className="gap-1">
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="How to score IELTS Band 7 in 30 days"
              className="text-base"
            />
          </div>

          <div>
            <Label htmlFor="slug">Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">/blog/</span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="how-to-score-band-7"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="One-paragraph summary that appears on the blog index and as the meta description fallback."
              rows={3}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Content</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => insertCta("test")}
                  type="button"
                >
                  <Sparkles className="h-3 w-3 mr-1" /> Insert Test CTA
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => insertCta("signup")}
                  type="button"
                >
                  <Sparkles className="h-3 w-3 mr-1" /> Insert Signup CTA
                </Button>
              </div>
            </div>
            <TiptapEditor
              content={contentHtml}
              onChange={(html) => setContentHtml(html)}
              placeholder="Start writing the post body. Use H2/H3 for section headings."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tip: the post title is rendered as the page&apos;s only H1 — use H2 / H3 for
              section headings inside the editor.
            </p>
          </div>
        </div>

        {/* Sidebar column */}
        <div className="space-y-5">
          <div className="rounded-lg border p-4 space-y-3">
            <Label>Thumbnail</Label>
            <FileUpload
              value={thumbnailUrl}
              onChange={setThumbnailUrl}
              accept="image/*"
              maxSizeMB={4}
            />
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 min-h-[40px]">
              {(allTags ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No tags yet — create some in the Tags admin.
                </span>
              )}
              {(allTags ?? []).map((tag) => {
                const active = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className="cursor-pointer"
                  >
                    <Badge
                      variant={active ? "default" : "outline"}
                      className="text-xs"
                    >
                      {tag.name}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <Label htmlFor="metaTitle">Meta title</Label>
              <Input
                id="metaTitle"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Defaults to title"
              />
            </div>
            <div>
              <Label htmlFor="metaDescription">Meta description</Label>
              <Textarea
                id="metaDescription"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
                placeholder="Defaults to excerpt"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {metaDescription.length}/160 chars (sweet spot)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
