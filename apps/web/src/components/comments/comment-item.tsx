'use client';

import { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth-store';
import { CommentInput } from './comment-input';
import { CommentReplies } from './comment-replies';
import { UserProfilePopover } from './user-profile-popover';
import type { Comment } from './types';
import { timeAgo, getInitials } from './types';

interface CommentItemProps {
  comment: Comment;
  testId: string;
  onReply: (body: string, parentId: string) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
  onLike: (commentId: string, liked: boolean) => void;
  isReplyPending?: boolean;
  isEditPending?: boolean;
}

export function CommentItem({
  comment,
  testId,
  onReply,
  onEdit,
  onDelete,
  onLike,
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

  const indent = comment.depth > 0;

  if (comment.isDeleted) {
    return (
      <div className={indent ? 'ml-11' : ''}>
        <div className="flex gap-3 py-3">
          <Avatar size="default" className="shrink-0">
            <AvatarFallback className="bg-slate-100 text-slate-400 text-xs">
              ?
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm text-slate-400 italic">
              This comment has been deleted.
            </p>
          </div>
        </div>
        {/* Still render replies for deleted parent */}
        {comment.replyCount > 0 && (
          <div className="ml-11">
            <CommentReplies
              comment={comment}
              testId={testId}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onLike={onLike}
              isReplyPending={isReplyPending}
              isEditPending={isEditPending}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={indent ? 'ml-11' : ''}>
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
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground truncate">
              {comment.user.displayName || 'Anonymous'}
            </span>
            <span className="text-xs text-slate-400">
              {timeAgo(comment.createdAt)}
            </span>
            {comment.createdAt !== comment.updatedAt && !comment.isDeleted && (
              <span className="text-xs text-slate-400">(edited)</span>
            )}
          </div>

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
            <div className="flex items-center gap-4 mt-1.5">
              {/* Reply */}
              {comment.depth < 2 && (
                <button
                  onClick={() => setShowReplyInput(!showReplyInput)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary font-medium cursor-pointer transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Reply
                </button>
              )}

              {/* Like */}
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

              {/* Edit / Delete for owner */}
              {isOwner && (
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

      {/* Replies section */}
      {comment.replyCount > 0 && (
        <div className="ml-11">
          <CommentReplies
            comment={comment}
            testId={testId}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            onLike={onLike}
            isReplyPending={isReplyPending}
            isEditPending={isEditPending}
          />
        </div>
      )}
    </div>
  );
}
