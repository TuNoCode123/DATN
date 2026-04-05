"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useAdminPronunciationTopics,
  useCreatePronunciationTopic,
  useUpdatePronunciationTopic,
  useTogglePronunciationTopicPublish,
  useDeletePronunciationTopic,
} from "@/features/admin/hooks";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Topic {
  id: string;
  name: string;
  description: string | null;
  difficulty: string;
  tags: string[];
  isPublished: boolean;
  orderIndex: number;
  createdAt: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-800",
  INTERMEDIATE: "bg-yellow-100 text-yellow-800",
  ADVANCED: "bg-red-100 text-red-800",
};

const emptyForm = {
  name: "",
  description: "",
  difficulty: "INTERMEDIATE",
  tags: "",
  isPublished: false,
};

export default function AdminPronunciationTopicsPage() {
  const [filters, setFilters] = useState<{ search?: string; difficulty?: string }>({});
  const { data: topicsData, isLoading } = useAdminPronunciationTopics(filters);
  const topics: Topic[] = topicsData?.data ?? [];

  const createTopic = useCreatePronunciationTopic();
  const updateTopic = useUpdatePronunciationTopic();
  const togglePublish = useTogglePronunciationTopicPublish();
  const deleteTopic = useDeletePronunciationTopic();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);

  function openCreate() {
    setEditingTopic(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(topic: Topic) {
    setEditingTopic(topic);
    setForm({
      name: topic.name,
      description: topic.description ?? "",
      difficulty: topic.difficulty,
      tags: topic.tags.join(", "),
      isPublished: topic.isPublished,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    const data = {
      name: form.name,
      description: form.description || undefined,
      difficulty: form.difficulty,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      isPublished: form.isPublished,
    };

    if (editingTopic) {
      updateTopic.mutate(
        { id: editingTopic.id, partial: data },
        {
          onSuccess: () => {
            toast.success("Topic updated");
            setDialogOpen(false);
          },
        }
      );
    } else {
      createTopic.mutate(data, {
        onSuccess: () => {
          toast.success("Topic created");
          setDialogOpen(false);
        },
        onError: (err: any) => {
          toast.error(err.response?.data?.message || "Failed to create topic");
        },
      });
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteTopic.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Topic deleted");
        setDeleteTarget(null);
      },
    });
  }

  const columns: ColumnDef<Topic, unknown>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-semibold">{row.original.name}</p>
          {row.original.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "difficulty",
      header: "Difficulty",
      cell: ({ getValue }) => {
        const d = getValue() as string;
        return (
          <Badge className={DIFFICULTY_COLORS[d] ?? ""}>
            {d.charAt(0) + d.slice(1).toLowerCase()}
          </Badge>
        );
      },
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ getValue }) => {
        const tags = getValue() as string[];
        if (!tags?.length) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Badge key={t} variant="outline" className="text-xs">
                {t}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "isPublished",
      header: "Published",
      cell: ({ row }) => (
        <Switch
          checked={row.original.isPublished}
          onCheckedChange={() =>
            togglePublish.mutate(row.original.id, {
              onSuccess: () => toast.success("Toggled publish status"),
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
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
        title="Pronunciation Topics"
        description="Manage topics for pronunciation practice"
      >
        <Button onClick={openCreate} className="gap-1">
          <Plus className="h-4 w-4" /> New Topic
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Input
          placeholder="Search topics..."
          className="max-w-xs"
          value={filters.search ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value || undefined }))
          }
        />
        <Select
          value={filters.difficulty ?? "ALL"}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              difficulty: v === "ALL" ? undefined : v,
            }))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Difficulties</SelectItem>
            <SelectItem value="BEGINNER">Beginner</SelectItem>
            <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
            <SelectItem value="ADVANCED">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={topics} isLoading={isLoading} />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTopic ? "Edit Topic" : "New Topic"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Travel, Business Meeting"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Short description of the topic"
              />
            </div>
            <div>
              <Label>Difficulty</Label>
              <Select
                value={form.difficulty}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, difficulty: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BEGINNER">Beginner</SelectItem>
                  <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                  <SelectItem value="ADVANCED">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
                placeholder="travel, hotel, airport"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isPublished}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isPublished: v }))
                }
              />
              <Label>Published</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || createTopic.isPending || updateTopic.isPending}
            >
              {editingTopic ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Topic"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        isLoading={deleteTopic.isPending}
        variant="danger"
      />
    </>
  );
}
