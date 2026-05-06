'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useReplies } from './use-comments';
import { CommentItem } from './comment-item';
import type { Comment } from './types';

interface CommentRepliesProps {
  comment: Comment;
  testId?: string;
  onReply: (body: string, parentId: string) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
  onLike: (commentId: string, liked: boolean) => void;
  onReport: (commentId: string) => void;
  isReplyPending?: boolean;
  isEditPending?: boolean;
}

// Walk the reply tree depth-first into a single flat list. Each entry keeps a
// pointer to its real parent so we can show a "Replying to @user" hint when
// the visual indent (now flat) no longer conveys the relationship.
function flattenReplies(
  root: Comment,
): Array<{ reply: Comment; parent: Comment }> {
  const out: Array<{ reply: Comment; parent: Comment }> = [];
  const walk = (p: Comment) => {
    for (const r of p.replies || []) {
      out.push({ reply: r, parent: p });
      walk(r);
    }
  };
  walk(root);
  return out;
}

export function CommentReplies({
  comment,
  testId,
  onReply,
  onEdit,
  onDelete,
  onLike,
  onReport,
  isReplyPending,
  isEditPending,
}: CommentRepliesProps) {
  const [showAll, setShowAll] = useState(false);

  const {
    data: repliesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useReplies(comment.id, showAll);

  // When expanded, swap eager direct replies with the full paginated set from
  // the server, then flatten the whole subtree.
  const expandedRoot: Comment =
    showAll && repliesData
      ? { ...comment, replies: repliesData.pages.flatMap((p) => p.data) }
      : comment;

  const flat = flattenReplies(expandedRoot);
  const eagerDirectCount = (comment.replies || []).length;
  const remainingDirectCount = comment.replyCount - eagerDirectCount;

  return (
    <div className="space-y-0">
      {flat.map(({ reply, parent }) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          // No hint when the parent IS the root — the indent already implies that.
          replyTo={parent.id === comment.id ? undefined : parent.user}
          testId={testId}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onLike={onLike}
          onReport={onReport}
          isReplyPending={isReplyPending}
          isEditPending={isEditPending}
        />
      ))}

      {!showAll && remainingDirectCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium mt-1 cursor-pointer transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          View {remainingDirectCount} more{' '}
          {remainingDirectCount === 1 ? 'reply' : 'replies'}
        </button>
      )}

      {showAll && hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium mt-1 cursor-pointer transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          {isFetchingNextPage ? 'Loading...' : 'Load more replies'}
        </button>
      )}
    </div>
  );
}
