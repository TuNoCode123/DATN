'use client';

import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable } from '@/components/admin/data-table';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAdminBundles, useCreateBundle, useUpdateBundle, useToggleBundlePublish, useDeleteBundle } from '@/features/admin/hooks';
import { useAdminTests } from '@/features/admin/hooks';
import type { AdminBundle } from '@/lib/admin-api';
import type { ExamType } from '@/features/admin/types';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, BookOpen } from 'lucide-react';

const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: 'IELTS_ACADEMIC', label: 'IELTS Academic' },
  { value: 'IELTS_GENERAL', label: 'IELTS General' },
  { value: 'TOEIC_LR', label: 'TOEIC L&R' },
  { value: 'TOEIC_SW', label: 'TOEIC S&W' },
  { value: 'TOEIC_SPEAKING', label: 'TOEIC Speaking' },
  { value: 'TOEIC_WRITING', label: 'TOEIC Writing' },
];

const EXAM_COLORS: Record<string, string> = {
  IELTS_ACADEMIC: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  IELTS_GENERAL: 'bg-teal-50 text-teal-700 border-teal-200',
  TOEIC_LR: 'bg-amber-50 text-amber-700 border-amber-200',
  TOEIC_SW: 'bg-rose-50 text-rose-700 border-rose-200',
  TOEIC_SPEAKING: 'bg-rose-50 text-rose-700 border-rose-200',
  TOEIC_WRITING: 'bg-amber-50 text-amber-700 border-amber-200',
};

interface BundleFormState {
  title: string;
  description: string;
  examType: ExamType;
  testIds: string[];
  orderIndex: number;
}

const defaultForm: BundleFormState = {
  title: '',
  description: '',
  examType: 'IELTS_ACADEMIC',
  testIds: [],
  orderIndex: 0,
};

export default function AdminBundlesPage() {
  const { data: bundles = [], isLoading } = useAdminBundles();
  const { data: testsData } = useAdminTests({ examType: undefined });
  const allTests = (testsData?.data ?? testsData ?? []) as { id: string; title: string; examType: string }[];

  const createBundle = useCreateBundle();
  const updateBundle = useUpdateBundle();
  const togglePublish = useToggleBundlePublish();
  const deleteBundle = useDeleteBundle();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminBundle | null>(null);
  const [form, setForm] = useState<BundleFormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<AdminBundle | null>(null);

  const filteredTests = allTests.filter((t) => t.examType === form.examType);

  function openCreate() {
    setEditTarget(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(bundle: AdminBundle) {
    setEditTarget(bundle);
    setForm({
      title: bundle.title,
      description: bundle.description ?? '',
      examType: bundle.examType as ExamType,
      testIds: bundle.tests.map((t) => t.id),
      orderIndex: bundle.orderIndex,
    });
    setDialogOpen(true);
  }

  function toggleTestId(id: string) {
    setForm((prev) => ({
      ...prev,
      testIds: prev.testIds.includes(id)
        ? prev.testIds.filter((x) => x !== id)
        : [...prev.testIds, id],
    }));
  }

  function handleSubmit() {
    if (!form.title.trim()) {
      toast.error('Bundle title is required');
      return;
    }
    if (editTarget) {
      updateBundle.mutate(
        { id: editTarget.id, data: { ...form } },
        {
          onSuccess: () => {
            toast.success('Bundle updated');
            setDialogOpen(false);
          },
          onError: () => toast.error('Failed to update bundle'),
        },
      );
    } else {
      createBundle.mutate(form, {
        onSuccess: () => {
          toast.success('Bundle created');
          setDialogOpen(false);
        },
        onError: () => toast.error('Failed to create bundle'),
      });
    }
  }

  const columns: ColumnDef<AdminBundle, unknown>[] = [
    {
      accessorKey: 'title',
      header: 'Bundle Title',
      cell: ({ getValue }) => (
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-semibold">{getValue() as string}</span>
        </div>
      ),
    },
    {
      accessorKey: 'examType',
      header: 'Exam',
      cell: ({ getValue }) => {
        const val = getValue() as string;
        return (
          <Badge variant="outline" className={EXAM_COLORS[val] || ''}>
            {val.replace('_', ' ')}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'tests',
      header: 'Tests',
      cell: ({ getValue }) => {
        const tests = getValue() as { id: string }[];
        return <span className="font-mono font-semibold">{tests.length}</span>;
      },
    },
    {
      accessorKey: 'orderIndex',
      header: 'Order',
      cell: ({ getValue }) => (
        <span className="font-mono text-muted-foreground">{getValue() as number}</span>
      ),
    },
    {
      accessorKey: 'isPublished',
      header: 'Published',
      cell: ({ row }) => (
        <Switch
          checked={row.original.isPublished}
          onCheckedChange={() =>
            togglePublish.mutate(row.original.id, {
              onSuccess: () =>
                toast.success(row.original.isPublished ? 'Bundle unpublished' : 'Bundle published'),
            })
          }
          className="cursor-pointer"
        />
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(getValue() as string).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer hover:bg-secondary"
            onClick={() => openEdit(row.original)}
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer hover:bg-secondary"
            onClick={() => setDeleteTarget(row.original)}
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Test Bundles"
        description="Group multiple tests under a named bundle for structured learning paths."
      >
        <Button onClick={openCreate} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" />
          New Bundle
        </Button>
      </PageHeader>

      <DataTable columns={columns} data={bundles} isLoading={isLoading} />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Bundle' : 'Create Bundle'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Bundle Name *</Label>
              <Input
                placeholder="e.g. IELTS Academic Full Practice Set"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this bundle..."
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Exam Type *</Label>
                <Select
                  value={form.examType}
                  onValueChange={(v) => setForm((p) => ({ ...p, examType: v as ExamType, testIds: [] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXAM_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.orderIndex}
                  onChange={(e) => setForm((p) => ({ ...p, orderIndex: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select Tests ({filteredTests.length} available)</Label>
              {filteredTests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center border rounded-md">
                  No {form.examType.replace('_', ' ')} tests found. Create tests first.
                </p>
              ) : (
                <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                  {filteredTests.map((test) => (
                    <label
                      key={test.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={form.testIds.includes(test.id)}
                        onCheckedChange={() => toggleTestId(test.id)}
                      />
                      <span className="text-sm">{test.title}</span>
                      {form.testIds.includes(test.id) && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          #{form.testIds.indexOf(test.id) + 1}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
              {form.testIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {form.testIds.length} test{form.testIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createBundle.isPending || updateBundle.isPending}
              className="cursor-pointer"
            >
              {editTarget ? 'Save Changes' : 'Create Bundle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteBundle.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success('Bundle deleted');
              setDeleteTarget(null);
            },
            onError: () => toast.error('Failed to delete'),
          });
        }}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This will remove the bundle and unlink all tests from it. The tests themselves will not be deleted."
        confirmText="Delete Bundle"
        variant="danger"
      />
    </>
  );
}
