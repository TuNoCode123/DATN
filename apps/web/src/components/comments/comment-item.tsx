'use client';

import { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Pencil,
  Trash2,
  Check,
  X,
  Flag,
  CornerDownRight,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth-store';
import { CommentInput } from './comment-input';
import { CommentReplies } from './comment-replies';
import { UserProfilePopover } from './user-profile-popover';
import type { Comment, CommentUser } from './types';
import { timeAgo, getInitials } from './types';

interface CommentItemProps {
  comment: Comment;
  testId?: string;
  // Set on flattened nested replies so we can render a "Replying to @user" hint.
  // The flat layout collapses all descendants to a single indent level, so the
  // hint is the only thing that conveys who the reply is actually addressing.
  replyTo?: CommentUser;
  onReply: (body: string, parentId: string) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
  onLike: (commentId: string, liked: boolean) => void;
  onReport: (commentId: string) => void;
  isReplyPending?: boolean;
  isEditPending?: boolean;
}

export function CommentItem({
  comment,
  testId,
  replyTo,
  onReply,
  onEdit,
  onDelete,
  onLike,
  onReport,
  isReplyPending,
  isEditPending,
}: CommentItemProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.id === comment.user.id;

  const handleReply = (body: string) => {
    onReply(body, comment.id);
    setShowReplyInput(false);
  };

  const handleEditSubmit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === comment.body) {
      setIsEditing(false);
      return;
    }
    onEdit(comment.id, trimmed);
    setIsEditing(false);
  };

  // Only the root comment renders its descendants block (flattened). Nested
  // replies are rendered as siblings by CommentReplies, so they skip this.
  const isRoot = comment.depth === 0;

  if (comment.isDeleted) {
    return (
      <div>
        <div className="flex gap-3 py-3">
          <Avatar size="default" className="shrink-0">
            <AvatarFallback className="bg-slate-100 text-slate-400 text-xs">
              ?
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-400 italic">
              This comment has been deleted.
            </p>
          </div>
        </div>
        {isRoot && comment.replyCount > 0 && (
          <div className="ml-11">
            <CommentReplies
              comment={comment}
              testId={testId}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onLike={onLike}
              onReport={onReport}
              isReplyPending={isReplyPending}
              isEditPending={isEditPending}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-3 py-3">
        <UserProfilePopover user={comment.user}>
          <Avatar size="default" className="shrink-0">
            {comment.user.avatarUrl ? (
              <AvatarImage src={comment.user.avatarUrl} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {getInitials(comment.user.displayName)}
            </AvatarFallback>
          </Avatar>
        </UserProfilePopover>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {comment.user.displayName || 'Anonymous'}
            </span>
            <span className="text-xs text-slate-400">
              {timeAgo(comment.createdAt)}
            </span>
            {comment.createdAt !== comment.updatedAt && !comment.isDeleted && (
              <span className="text-xs text-slate-400">(edited)</span>
            )}
            {comment.status === 'PENDING' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Pending review
              </span>
            )}
          </div>

          {/* Replying-to hint for flattened nested replies */}
          {replyTo && !isEditing && (
            <div className="flex items-center gap-1 mb-1 text-xs text-slate-500">
              <CornerDownRight className="w-3 h-3 text-slate-400" />
              <span>
                Replying to{' '}
                <span className="font-semibold text-primary">
                  @{replyTo.displayName || 'Anonymous'}
                </span>
              </span>
            </div>
          )}

          {/* Body */}
          {isEditing ? (
            <div className="mt-1">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full resize-none rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[48px]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEditSubmit();
                  }
                  if (e.key === 'Escape') setIsEditing(false);
                }}
              />
              <div className="flex gap-1.5 mt-1.5">
                <button
                  onClick={handleEditSubmit}
                  disabled={isEditPending}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditText(comment.body);
                  }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
              {comment.body}
            </p>
          )}

          {/* Actions */}
          {!isEditing && (
            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
              <button
                onClick={() => setShowReplyInput(!showReplyInput)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary font-medium cursor-pointer transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Reply
              </button>

              <button
                onClick={() => user && onLike(comment.id, comment.likedByMe)}
                className={`flex items-center gap-1 text-xs font-medium cursor-pointer transition-colors ${
                  comment.likedByMe
                    ? 'text-red-500'
                    : 'text-slate-400 hover:text-red-500'
                }`}
              >
                <Heart
                  className="w-3.5 h-3.5"
                  fill={comment.likedByMe ? 'currentColor' : 'none'}
                />
                {comment.likeCount > 0 && comment.likeCount}
              </button>

              {isOwner ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setEditText(comment.body);
                    }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(comment.id)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </>
              ) : (
                user && (
                  <button
                    onClick={() => onReport(comment.id)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-500 cursor-pointer transition-colors"
                  >
                    <Flag className="w-3 h-3" />
                    Report
                  </button>
                )
              )}
            </div>
          )}

          {/* Inline reply input */}
          {showReplyInput && (
            <div className="mt-3">
              <CommentInput
                onSubmit={handleReply}
                isPending={isReplyPending}
                placeholder={`Reply to ${comment.user.displayName || 'Anonymous'}...`}
                compact
                autoFocus
                onCancel={() => setShowReplyInput(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Flat descendants block — only the root comment owns this. */}
      {isRoot && comment.replyCount > 0 && (
        <div className="ml-11">
          <CommentReplies
            comment={comment}
            testId={testId}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            onLike={onLike}
            onReport={onReport}
            isReplyPending={isReplyPending}
            isEditPending={isEditPending}
          />
        </div>
      )}
    </div>
  );
}
