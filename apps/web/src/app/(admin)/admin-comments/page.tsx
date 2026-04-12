'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  XCircle,
  Trash2,
  AlertTriangle,
  Flag,
  Clock,
  EyeOff,
  MessageSquare,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/admin/page-header';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import {
  useAdminCommentQueue,
  useApproveComment,
  useRejectComment,
  useAdminDeleteComment,
} from '@/features/admin/hooks';

interface ReportItem {
  id: string;
  reason: string;
  createdAt: string;
  user: { id: string; displayName: string | null };
}

interface QueueComment {
  id: string;
  testId: string;
  userId: string;
  body: string;
  status: 'PENDING' | 'HIDDEN';
  reportCount: number;
  createdAt: string;
  user: { id: string; displayName: string | null; avatarUrl: string | null };
  reports: ReportItem[];
}

export default function AdminCommentsPage() {
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading } = useAdminCommentQueue(page);
  const approveMut = useApproveComment();
  const rejectMut = useRejectComment();
  const deleteMut = useAdminDeleteComment();

  const comments: QueueComment[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

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

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <PageHeader
        title="Comment Moderation"
        description="Review reported and pending comments"
      />

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="w-4 h-4" />
          <span>{total} comment{total !== 1 ? 's' : ''} in queue</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                  <div className="h-3 w-2/3 bg-muted rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">All clear!</h3>
          <p className="text-sm text-muted-foreground">
            No comments need moderation right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <Avatar className="w-10 h-10 shrink-0">
                  {comment.user.avatarUrl && (
                    <AvatarImage src={comment.user.avatarUrl} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                    {(comment.user.displayName || '?').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {comment.user.displayName || 'Anonymous'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {comment.status === 'PENDING' ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[11px] gap-1">
                        <Clock className="w-3 h-3" /> Pending
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-[11px] gap-1">
                        <EyeOff className="w-3 h-3" /> Hidden
                      </Badge>
                    )}
                    {comment.reportCount > 0 && (
                      <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-[11px] gap-1">
                        <Flag className="w-3 h-3" /> {comment.reportCount} report{comment.reportCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Comment body */}
              <div className="ml-[52px]">
                <div className="bg-muted/50 rounded-lg px-4 py-3 mb-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                    {comment.body}
                  </p>
                </div>

                {/* Reports detail */}
                {comment.reports.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                      Report reasons
                    </p>
                    <div className="space-y-1">
                      {comment.reports.map((report) => (
                        <div
                          key={report.id}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <span className="font-medium text-foreground shrink-0">
                            {report.user.displayName || 'User'}:
                          </span>
                          <span className="italic">&quot;{report.reason}&quot;</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 gap-1.5 cursor-pointer"
                    onClick={() => handleApprove(comment.id)}
                    disabled={approveMut.isPending}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700 gap-1.5 cursor-pointer"
                    onClick={() => handleReject(comment.id)}
                    disabled={rejectMut.isPending}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Hide
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 gap-1.5 cursor-pointer"
                    onClick={() => setDeleteTarget(comment.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="cursor-pointer"
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="cursor-pointer"
          >
            Next
          </Button>
        </div>
      )}

      {/* Delete confirmation */}
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
