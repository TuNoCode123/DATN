"use client";

import { use } from "react";
import { useAdminBlogPost } from "@/features/admin/hooks";
import { BlogPostForm } from "@/components/admin/blog-post-form";

export default function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: post, isLoading } = useAdminBlogPost(id);

  if (isLoading) {
    return <div className="text-muted-foreground">Loading post…</div>;
  }
  if (!post) {
    return <div className="text-destructive">Post not found.</div>;
  }

  return (
    <BlogPostForm
      mode="edit"
      initial={{
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        contentHtml: post.contentHtml,
        thumbnailUrl: post.thumbnailUrl,
        metaTitle: post.metaTitle,
        metaDescription: post.metaDescription,
        status: post.status,
        tags: post.tags,
      }}
    />
  );
}
