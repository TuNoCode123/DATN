"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAdminBlogPosts,
  useToggleBlogPublish,
  useDeleteBlogPost,
} from "@/features/admin/hooks";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";

interface BlogTag {
  id: string;
  name: string;
  slug: string;
}

interface BlogRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  thumbnailUrl: string | null;
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED";
  publishedAt: string | null;
  viewCount: number;
  updatedAt: string;
  tags: BlogTag[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  SCHEDULED: "bg-amber-100 text-amber-800",
};

export default function AdminBlogPage() {
  const [filters, setFilters] = useState<{
    search?: string;
    status?: "DRAFT" | "PUBLISHED" | "SCHEDULED";
  }>({});
  const { data: postsData, isLoading } = useAdminBlogPosts(filters);
  const posts: BlogRow[] = postsData?.data ?? [];

  const togglePublish = useToggleBlogPublish();
  const deletePost = useDeleteBlogPost();
  const [deleteTarget, setDeleteTarget] = useState<BlogRow | null>(null);

  function handleDelete() {
    if (!deleteTarget) return;
    deletePost.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Post deleted");
        setDeleteTarget(null);
      },
    });
  }

  const columns: ColumnDef<BlogRow, unknown>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div className="flex items-center gap-3 min-w-0">
          {row.original.thumbnailUrl ? (
            <div className="relative w-12 h-12 shrink-0 overflow-hidden rounded border">
              <Image
                src={row.original.thumbnailUrl}
                alt=""
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 shrink-0 rounded border bg-muted" />
          )}
          <div className="min-w-0">
            <p className="font-semibold truncate">{row.original.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              /blog/{row.original.slug}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ getValue }) => {
        const tags = getValue() as BlogTag[];
        if (!tags?.length)
          return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((t) => (
              <Badge key={t.id} variant="outline" className="text-xs">
                {t.name}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge className={STATUS_COLORS[row.original.status] ?? ""}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "viewCount",
      header: "Views",
      cell: ({ row }) => (
        <span className="tabular-nums text-sm">{row.original.viewCount}</span>
      ),
    },
    {
      accessorKey: "publishedAt",
      header: "Published",
      cell: ({ row }) => {
        if (!row.original.publishedAt)
          return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.publishedAt).toLocaleDateString()}
          </span>
        );
      },
    },
    {
      id: "publish",
      header: "Live",
      cell: ({ row }) => (
        <Switch
          checked={row.original.status === "PUBLISHED"}
          onCheckedChange={() =>
            togglePublish.mutate(row.original.id, {
              onSuccess: () => toast.success("Status updated"),
            })
          }
        />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/admin-blog/${row.original.id}/preview`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/admin-blog/${row.original.id}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDeleteTarget(row.original)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Blog Posts"
        description="Write SEO articles that drive traffic to your tests."
      >
        <Button asChild className="gap-1">
          <Link href="/admin-blog/new">
            <Plus className="h-4 w-4" /> New Post
          </Link>
        </Button>
      </PageHeader>

      <div className="flex items-center gap-3 mb-4">
        <Input
          placeholder="Search posts..."
          className="max-w-xs"
          value={filters.search ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value || undefined }))
          }
        />
        <Select
          value={filters.status ?? "ALL"}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              status:
                v === "ALL"
                  ? undefined
                  : (v as "DRAFT" | "PUBLISHED" | "SCHEDULED"),
            }))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={posts} isLoading={isLoading} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Post"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        onConfirm={handleDelete}
        isLoading={deletePost.isPending}
        variant="danger"
      />
    </>
  );
}
