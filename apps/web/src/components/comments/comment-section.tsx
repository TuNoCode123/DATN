'use client';

import { useState } from 'react';
import { MessageSquare, ArrowUpDown } from 'lucide-react';
import { App } from 'antd';
import { useAuthStore } from '@/lib/auth-store';
import { CommentInput } from './comment-input';
import { CommentItem } from './comment-item';
import { CommentSkeleton } from './comment-skeleton';
import {
  useComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
  useLikeComment,
  useReportComment,
} from './use-comments';

interface CommentSectionProps {
  testId: string;
}

export function CommentSection({ testId }: CommentSectionProps) {
  const { message } = App.useApp();
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const user = useAuthStore((s) => s.user);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useComments(testId, sort);

  const createMutation = useCreateComment(testId);
  const updateMutation = useUpdateComment(testId);
  const deleteMutation = useDeleteComment(testId);
  const likeMutation = useLikeComment(testId);
  const reportMutation = useReportComment(testId);

  const comments = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const requireAuth = (action: () => void) => {
    if (!user) {
      message.warning('Please sign in to continue');
      return;
    }
    action();
  };

  const handleCreateRoot = (body: string) => {
    requireAuth(() => {
      createMutation.mutate({ body });
    });
  };

  const handleReply = (body: string, parentId: string) => {
    requireAuth(() => {
      createMutation.mutate({ body, parentId });
    });
  };

  const handleEdit = (commentId: string, body: string) => {
    updateMutation.mutate({ commentId, body });
  };

  const handleDelete = (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    deleteMutation.mutate(commentId);
  };

  const handleLike = (commentId: string, liked: boolean) => {
    requireAuth(() => {
      likeMutation.mutate({ commentId, liked });
    });
  };

  const handleReport = (commentId: string) => {
    requireAuth(() => {
      const reason = prompt('Why are you reporting this comment?');
      if (!reason?.trim()) return;
      reportMutation.mutate(
        { commentId, reason: reason.trim() },
        {
          onSuccess: () => message.success('Comment reported'),
          onError: () => message.error('Already reported or failed'),
        },
      );
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-slate-500" />
          <h3 className="text-base font-bold text-foreground">
            Comments {total > 0 && `(${total})`}
          </h3>
        </div>
        <button
          onClick={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground font-medium cursor-pointer transition-colors"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sort === 'newest' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>

      {/* Input */}
      <CommentInput
        onSubmit={handleCreateRoot}
        isPending={createMutation.isPending}
        placeholder="Share your thoughts..."
      />

      {/* List */}
      {isLoading ? (
        <CommentSkeleton count={3} />
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">
            No comments yet. Be the first to share your thoughts!
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              testId={testId}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onLike={handleLike}
              onReport={handleReport}
              isReplyPending={createMutation.isPending}
              isEditPending={updateMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasNextPage && (
        <div className="text-center mt-4">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-sm text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more comments'}
          </button>
        </div>
      )}
    </div>
  );
}
