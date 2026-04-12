export interface CommentUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type CommentStatus = 'PUBLISHED' | 'PENDING' | 'HIDDEN' | 'DELETED';

export interface Comment {
  id: string;
  testId: string;
  parentId: string | null;
  body: string;
  status: CommentStatus;
  likeCount: number;
  replyCount: number;
  depth: number;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  isPending?: boolean;
  user: CommentUser;
  likedByMe: boolean;
  replies: Comment[];
  moderationReason?: string;
}

export interface CommentsResponse {
  data: Comment[];
  total: number;
  page: number;
  limit: number;
}

export function timeAgo(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  // Format as "Mar 26, 2026"
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
