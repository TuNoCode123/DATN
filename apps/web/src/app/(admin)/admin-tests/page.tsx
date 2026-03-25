'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable } from '@/components/admin/data-table';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminTests, useDeleteTest, useToggleTestPublish, useDuplicateTest } from '@/features/admin/hooks';
import type { AdminTest } from '@/features/admin/types';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Clock, Copy } from 'lucide-react';

export default function AdminTestsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<{ examType?: string }>({});
  const { data: testsData, isLoading } = useAdminTests(filters);
  const tests: AdminTest[] = testsData?.data ?? testsData ?? [];
  const deleteTest = useDeleteTest();
  const togglePublish = useToggleTestPublish();
  const duplicateTest = useDuplicateTest();
  const [deleteTarget, setDeleteTarget] = useState<AdminTest | null>(null);

  const handlePublishToggle = (test: AdminTest) => {
    togglePublish.mutate(test.id, {
      onSuccess: () => toast.success(`Test ${test.isPublished ? 'unpublished' : 'published'}`),
    });
  };

  const handleDuplicate = (test: AdminTest) => {
    duplicateTest.mutate(test.id, {
      onSuccess: () => toast.success(`"${test.title}" duplicated`),
    });
  };

  const columns: ColumnDef<AdminTest, unknown>[] = [
    {
      accessorKey: 'title',
      header: 'Test Title',
      cell: ({ getValue }) => <span className="font-semibold">{getValue() as string}</span>,
    },
    {
      accessorKey: 'examType',
      header: 'Exam',
      cell: ({ getValue }) => {
        const val = getValue() as string;
        const colors: Record<string, string> = {
          IELTS_ACADEMIC: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          IELTS_GENERAL: 'bg-teal-50 text-teal-700 border-teal-200',
          TOEIC_LR: 'bg-amber-50 text-amber-700 border-amber-200',
          TOEIC_SW: 'bg-rose-50 text-rose-700 border-rose-200',
        };
        return <Badge variant="outline" className={colors[val] || ''}>{val.replace('_', ' ')}</Badge>;
      },
    },
    {
      accessorKey: 'durationMins',
      header: 'Duration',
      cell: ({ getValue }) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          {getValue() as number} min
        </div>
      ),
    },
    {
      accessorKey: 'sectionCount',
      header: 'Sections',
      cell: ({ getValue }) => <span className="font-mono font-semibold">{getValue() as number}</span>,
    },
    {
      accessorKey: 'questionCount',
      header: 'Questions',
      cell: ({ getValue }) => <span className="font-mono font-semibold">{getValue() as number}</span>,
    },
    {
      accessorKey: 'isPublished',
      header: 'Published',
      cell: ({ row }) => (
        <Switch
          checked={row.original.isPublished}
          onCheckedChange={() => handlePublishToggle(row.original)}
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
            onClick={() => router.push(`/admin-tests/${row.original.id}/edit`)}
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer hover:bg-secondary"
            onClick={() => handleDuplicate(row.original)}
            title="Duplicate"
          >
            <Copy className="w-4 h-4" />
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
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Test Management" description="Create and manage IELTS & TOEIC assessments">
        <Button onClick={() => router.push('/admin-tests/new')} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />
          Create Test
        </Button>
      </PageHeader>
      <DataTable
        columns={columns}
        data={tests}
        searchKey="title"
        searchPlaceholder="Search tests..."
        isLoading={isLoading}
        filterBar={
          <div className="flex gap-2">
            <Select
              value={filters.examType ?? 'all'}
              onValueChange={(v) => setFilters((f) => ({ ...f, examType: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger className="w-[160px] border-0 bg-card shadow-sm h-10">
                <SelectValue placeholder="Exam" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Exams</SelectItem>
                <SelectItem value="IELTS_ACADEMIC">IELTS Academic</SelectItem>
                <SelectItem value="IELTS_GENERAL">IELTS General</SelectItem>
                <SelectItem value="TOEIC_LR">TOEIC L&R</SelectItem>
                <SelectItem value="TOEIC_SW">TOEIC S&W</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Test"
        description={`Delete "${deleteTarget?.title}"? This will also delete all sections, questions, and passages. This cannot be undone.`}
        onConfirm={() =>
          deleteTarget &&
          deleteTest.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success('Test deleted');
              setDeleteTarget(null);
            },
          })
        }
        confirmText="Delete"
      />
    </div>
  );
}
