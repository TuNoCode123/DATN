'use client';

import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  CheckCircle2,
  XCircle,
  Trash2,
  AlertTriangle,
  Flag,
  Clock,
  EyeOff,
  FileText,
  BookOpen,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable } from '@/components/admin/data-table';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import {
  useAdminCommentQueue,
  useApproveComment,
  useRejectComment,
  useAdminDeleteComment,
} from '@/features/admin/hooks';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReportItem {
  id: string;
  reason: string;
  createdAt: string;
  user: { id: string; displayName: string | null };
}

interface QueueComment {
  id: string;
  testId: string | null;
  blogPostId: string | null;
  userId: string;
  body: string;
  status: 'PENDING' | 'HIDDEN' | 'PUBLISHED';
  reportCount: number;
  createdAt: string;
  user: { id: string; displayName: string | null; avatarUrl: string | null };
  test: { id: string; title: string } | null;
  blogPost: { id: string; title: string } | null;
  reports: ReportItem[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  PENDING: {
    label: 'Pending',
    icon: <Clock className="w-3 h-3" />,
    className: 'text-amber-600 border-amber-300 bg-amber-50',
  },
  HIDDEN: {
    label: 'Hidden',
    icon: <EyeOff className="w-3 h-3" />,
    className: 'text-red-600 border-red-300 bg-red-50',
  },
  PUBLISHED: {
    label: 'Published',
    icon: <CheckCircle2 className="w-3 h-3" />,
    className: 'text-emerald-600 border-emerald-300 bg-emerald-50',
  },
};

export default function AdminCommentsPage() {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const serverFilters = {
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  };

  const { data, isLoading } = useAdminCommentQueue(1, 200, serverFilters);
  const approveMut = useApproveComment();
  const rejectMut = useRejectComment();
  const deleteMut = useAdminDeleteComment();

  const comments: QueueComment[] = data?.data ?? [];

  const handleApprove = (id: string) => {
    approveMut.mutate(id, {
      onSuccess: () => toast.success('Comment approved'),
      onError: () => toast.error('Failed to approve'),
    });
  };

  const handleReject = (id: string) => {
    rejectMut.mutate(id, {
      onSuccess: () => toast.success('Comment hidden'),
      onError: () => toast.error('Failed to reject'),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget, {
      onSuccess: () => {
        toast.success('Comment deleted');
        setDeleteTarget(null);
      },
      onError: () => toast.error('Failed to delete'),
    });
  };

  const columns: ColumnDef<QueueComment, unknown>[] = [
    {
      accessorKey: 'user',
      header: 'User',
      enableSorting: false,
      cell: ({ row }) => {
        const user = row.original.user;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8 shrink-0">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {(user.displayName || '?').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate max-w-[120px]">
              {user.displayName || 'Anonymous'}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'body',
      header: 'Comment',
      cell: ({ row }) => (
        <p className="text-sm text-foreground truncate max-w-[300px]" title={row.original.body}>
          {row.original.body}
        </p>
      ),
    },
    {
      id: 'source',
      header: 'Source',
      enableSorting: false,
      cell: ({ row }) => {
        const { test, blogPost } = row.original;
        if (test) {
          return (
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-sm truncate max-w-[160px]" title={test.title}>
                {test.title}
              </span>
            </div>
          );
        }
        if (blogPost) {
          return (
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span className="text-sm truncate max-w-[160px]" title={blogPost.title}>
                {blogPost.title}
              </span>
            </div>
          );
        }
        return <span className="text-sm text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status];
        return (
          <Badge variant="outline" className={`${cfg.className} text-[11px] gap-1`}>
            {cfg.icon} {cfg.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'reportCount',
      header: 'Reports',
      cell: ({ row }) => {
        const { reportCount, reports } = row.original;
        if (reportCount === 0) {
          return <span className="text-sm text-muted-foreground">0</span>;
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-[11px] gap-1 cursor-help">
                  <Flag className="w-3 h-3" /> {reportCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1">
                  <p className="text-xs font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-orange-500" /> Report reasons
                  </p>
                  {reports.map((r) => (
                    <p key={r.id} className="text-xs">
                      <span className="font-medium">{r.user.displayName || 'User'}:</span>{' '}
                      <span className="italic">&quot;{r.reason}&quot;</span>
                    </p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => {
        const { status } = row.original;
        return (
          <div className="flex items-center gap-1">
            {status !== 'PUBLISHED' && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); handleApprove(row.original.id); }}
                disabled={approveMut.isPending}
                title="Approve"
              >
                <CheckCircle2 className="w-4 h-4" />
              </Button>
            )}
            {status !== 'HIDDEN' && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-orange-600 hover:bg-orange-50 hover:text-orange-700 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); handleReject(row.original.id); }}
                disabled={rejectMut.isPending}
                title="Hide"
              >
                <XCircle className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(row.original.id); }}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const filterBar = (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="w-[160px] h-10 border-0 bg-card shadow-sm cursor-pointer">
        <SelectValue placeholder="All statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All statuses</SelectItem>
        <SelectItem value="PENDING">Pending</SelectItem>
        <SelectItem value="HIDDEN">Hidden</SelectItem>
        <SelectItem value="PUBLISHED">Published</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="p-4 md:p-6 w-full">
      <PageHeader
        title="Comment Moderation"
        description="Review and manage all comments"
      />

      <DataTable
        columns={columns}
        data={comments}
        searchKey="body"
        searchPlaceholder="Search comments..."
        isLoading={isLoading}
        filterBar={filterBar}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete comment"
        description="This will permanently remove the comment. This action cannot be undone."
        onConfirm={handleDelete}
        variant="danger"
        confirmText="Delete"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
