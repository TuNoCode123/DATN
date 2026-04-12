"use client";

import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminBlogPost } from "@/features/admin/hooks";
import { PostRenderer } from "@/components/blog/post-renderer";
import { ArrowLeft, Pencil } from "lucide-react";

export default function PreviewBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: post, isLoading } = useAdminBlogPost(id);

  if (isLoading) {
    return <div className="text-muted-foreground">Loading preview…</div>;
  }
  if (!post) {
    return <div className="text-destructive">Post not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin-blog">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge>{post.status}</Badge>
          <Button asChild size="sm">
            <Link href={`/admin-blog/${id}/edit`}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Link>
          </Button>
        </div>
      </div>

      <article className="max-w-3xl mx-auto bg-cream rounded-lg border p-8">
        <div className="flex flex-wrap gap-2 mb-4">
          {post.tags.map((t: { id: string; name: string }) => (
            <Badge key={t.id} variant="outline">
              {t.name}
            </Badge>
          ))}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-3 leading-tight">
          {post.title}
        </h1>
        <p className="text-lg text-slate-600 mb-6">{post.excerpt}</p>
        {post.thumbnailUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={post.thumbnailUrl}
            alt={post.title}
            className="w-full rounded-lg border-2 border-border mb-6"
          />
        )}
        <PostRenderer html={post.contentHtml} />
      </article>
    </div>
  );
}
