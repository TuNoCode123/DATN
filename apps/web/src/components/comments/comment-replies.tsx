'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useReplies } from './use-comments';
import { CommentItem } from './comment-item';
import type { Comment } from './types';

interface CommentRepliesProps {
  comment: Comment;
  testId: string;
  onReply: (body: string, parentId: string) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
  onLike: (commentId: string, liked: boolean) => void;
  isReplyPending?: boolean;
  isEditPending?: boolean;
}

export function CommentReplies({
  comment,
  testId,
  onReply,
  onEdit,
  onDelete,
  onLike,
  isReplyPending,
  isEditPending,
}: CommentRepliesProps) {
  const [showAll, setShowAll] = useState(false);

  // Use eager replies from parent if not loading more
  const {
    data: repliesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useReplies(comment.id, showAll);

  // Show eager replies initially, switch to full data when expanded
  const eagerReplies = comment.replies || [];
  const loadedReplies = showAll && repliesData
    ? repliesData.pages.flatMap((p) => p.data)
    : eagerReplies;

  const remainingCount = comment.replyCount - eagerReplies.length;

  return (
    <div>
      {loadedReplies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          testId={testId}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onLike={onLike}
          isReplyPending={isReplyPending}
          isEditPending={isEditPending}
        />
      ))}

      {!showAll && remainingCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium mt-1 ml-11 cursor-pointer transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          View {remainingCount} more {remainingCount === 1 ? 'reply' : 'replies'}
        </button>
      )}

      {showAll && hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium mt-1 ml-11 cursor-pointer transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          {isFetchingNextPage ? 'Loading...' : 'Load more replies'}
        </button>
      )}
    </div>
  );
}
