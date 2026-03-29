# Comment Module — Implementation Summary

## Context

The test detail page had a "Discussion" tab stub. This implementation adds a full-featured comment system similar to Facebook/forum threads, with nested replies, likes, edit/delete, and lazy-loaded pagination.

---

## Database Changes

### Migration: `add_comment_reply_count_depth_soft_delete`

Added 3 columns to `comments` table:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `replyCount` | `Int` | `0` | Denormalized count of direct replies |
| `depth` | `Int` | `0` | Nesting level: 0=root, 1=reply, 2=reply-to-reply (max) |
| `deletedAt` | `DateTime?` | `null` | Soft delete timestamp (null = active) |

**File:** `apps/api/prisma/schema.prisma`

---

## Backend Changes

### New Files

| File | Purpose |
|------|---------|
| `apps/api/src/comments/create-comment.dto.ts` | Validates `body` (required, max 5000 chars, trimmed) + optional `parentId` |
| `apps/api/src/comments/update-comment.dto.ts` | Validates `body` (required, max 5000 chars, trimmed) |
| `apps/api/src/comments/query-comments.dto.ts` | Validates `page`, `limit`, `sort` (newest/oldest) |
| `apps/api/src/auth/guards/optional-jwt-auth.guard.ts` | JWT guard that allows anonymous access (returns `null` user instead of 401) |

### Modified Files

#### `apps/api/src/comments/comments.service.ts` — Full Rewrite

**`findByTest(testId, page, limit, sort, userId?)`**
- Fetches root comments (`parentId: null`) with first 3 replies eagerly loaded
- Supports `newest`/`oldest` sorting
- Batch-queries `comment_likes` table to attach `likedByMe` boolean per comment
- Masks soft-deleted comments: replaces body with "This comment has been deleted", nulls user info
- Includes soft-deleted comments that still have replies (preserves thread structure)

**`findReplies(commentId, page, limit, userId?)` — New**
- Paginated replies for a specific parent comment
- Same `likedByMe` and soft-delete masking logic
- Returns `{data, total, page, limit}`

**`create(userId, testId, body, parentId?)` — Enhanced**
- Computes `depth` from parent's depth
- Rejects depth > 2 (max nesting enforced server-side)
- Flattens deep replies: if replying to a depth-1+ comment, attaches to the appropriate ancestor
- Uses `$transaction`: creates comment + increments parent's `replyCount` + increments test's `commentCount`

**`update(commentId, userId, body)` — New**
- Ownership check (403 if not owner)
- Cannot edit soft-deleted comments (400)
- Updates body text

**`delete(commentId, userId)` — Changed to Soft Delete**
- If comment has no replies → hard delete + decrement counts
- If comment has replies → soft delete only (set `deletedAt`) to preserve thread

**`like(commentId, userId)` — Enhanced**
- Rejects likes on deleted comments
- Uses transaction for atomicity

**`unlike(commentId, userId)` — Enhanced**
- Uses transaction for atomicity

**Helper Methods:**
- `collectCommentIds()` — recursively collects all comment IDs from nested structure
- `getLikedSet()` — single batch query to resolve `likedByMe` for all visible comments
- `mapComment()` — transforms DB record to API response (masks deleted comments, attaches `likedByMe`)

#### `apps/api/src/comments/comments.controller.ts` — Enhanced

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `GET /api/tests/:testId/comments` | GET | Optional JWT | Paginated root comments with sort |
| `POST /api/tests/:testId/comments` | POST | Required JWT | Create comment or reply |
| `GET /api/comments/:id/replies` | GET | Optional JWT | Paginated replies for a comment |
| `PATCH /api/comments/:id` | PATCH | Required JWT | Edit own comment |
| `DELETE /api/comments/:id` | DELETE | Required JWT | Soft/hard delete own comment |
| `POST /api/comments/:id/like` | POST | Required JWT | Like a comment |
| `DELETE /api/comments/:id/like` | DELETE | Required JWT | Unlike a comment |

### API Response Shape

```json
{
  "data": [
    {
      "id": "cuid",
      "testId": "cuid",
      "parentId": null,
      "body": "Comment text...",
      "likeCount": 3,
      "replyCount": 5,
      "depth": 0,
      "createdAt": "2026-03-26T10:00:00.000Z",
      "updatedAt": "2026-03-26T10:00:00.000Z",
      "isDeleted": false,
      "user": {
        "id": "cuid",
        "displayName": "John Doe",
        "avatarUrl": null
      },
      "likedByMe": false,
      "replies": [
        {
          "id": "cuid",
          "depth": 1,
          "body": "Reply text...",
          "replies": [],
          "...": "same shape"
        }
      ]
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 10
}
```

---

## Frontend Changes

### New Files

All in `apps/web/src/components/comments/`:

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript interfaces (`Comment`, `CommentUser`, `CommentsResponse`), `timeAgo()` utility, `getInitials()` utility |
| `use-comments.ts` | React Query hooks: `useComments` (infinite query), `useReplies` (lazy infinite query), `useCreateComment`, `useUpdateComment`, `useDeleteComment`, `useLikeComment` |
| `comment-section.tsx` | Main entry component — header with comment count, sort toggle (newest/oldest), comment input, comment list, "Load more" pagination |
| `comment-input.tsx` | Reusable textarea + send button. Two variants: normal (top-level) and compact (inline reply). Supports Enter to submit, Escape to cancel, empty validation |
| `comment-item.tsx` | Single comment display: avatar (initials fallback), username, timestamp, body, action buttons (Reply, Like, Edit, Delete). Inline edit mode with save/cancel. Deleted state shows gray placeholder. Hides Reply button at depth 2 |
| `comment-replies.tsx` | Reply section under a comment. Shows first 3 replies eagerly, "View N more replies" button triggers lazy fetch via `useReplies` hook |
| `comment-skeleton.tsx` | Loading placeholder with skeleton rows matching comment layout |

### Component Tree

```
<CommentSection testId={id}>
  ├── Header (title + sort toggle)
  ├── <CommentInput /> (top-level "Share your thoughts...")
  ├── <CommentItem comment depth=0>
  │     ├── Avatar + Username + Timestamp
  │     ├── Body (or edit textarea)
  │     ├── Actions: Reply | Like | Edit | Delete
  │     ├── <CommentInput /> (inline reply, toggled)
  │     └── <CommentReplies>
  │           ├── <CommentItem depth=1>
  │           │     └── <CommentReplies>
  │           │           └── <CommentItem depth=2> (no Reply button)
  │           └── "View N more replies" button
  └── "Load more comments" button
```

### Modified Files

#### `apps/web/src/app/(learner)/tests/[id]/page.tsx`

- Added import: `import { CommentSection } from '@/components/comments/comment-section'`
- Replaced Discussion tab stub (lines 301-305) with: `<CommentSection testId={testId} />`

---

## Key Design Decisions

### Depth Limiting (Max 2 Levels)
- `depth` column stored on each comment, computed at write time from parent's depth
- Server rejects depth > 2 with 400 error
- Frontend hides Reply button at depth 2 (belt-and-suspenders)
- Deep replies are flattened to attach to the nearest valid ancestor

### Soft Delete
- Comments with replies: set `deletedAt` timestamp, show "This comment has been deleted" placeholder, preserve thread
- Comments without replies: hard delete + decrement counters
- Soft-deleted comments with replies still appear in query results to maintain thread structure

### Reply Pagination (Lazy Loading)
- First 3 replies per root comment loaded eagerly in main query (`take: 3`)
- "View N more replies" button triggers `GET /comments/:id/replies` with pagination
- Uses React Query `useInfiniteQuery` for seamless page appending

### `likedByMe` Resolution
- Collects all visible comment IDs (roots + replies) into a single `WHERE commentId IN (...)` query
- Exactly 1 extra SQL query regardless of comment count (avoids N+1)
- Anonymous users always get `likedByMe: false`

### Polling (30s)
- `useComments` hook sets `refetchInterval: 30000`
- Simple, no WebSocket infrastructure needed
- Adequate for discussion threads (not real-time chat)

### No New Dependencies
- Uses existing: React Query, Axios, Zustand, shadcn/ui Avatar/Skeleton, Lucide icons
- `timeAgo()` utility hand-written (~20 lines) instead of adding `date-fns`

---

## Verification Checklist

### Backend
- [ ] Run `npx prisma generate` (stop dev server first to avoid file lock)
- [ ] Start API server: `npm run dev:api`
- [ ] Create root comment: `POST /api/tests/:id/comments` with `{ "body": "Hello" }`
- [ ] Create reply: `POST /api/tests/:id/comments` with `{ "body": "Reply", "parentId": "..." }`
- [ ] Create depth-2 reply (reply to reply)
- [ ] Verify depth-3 reply is rejected (400)
- [ ] Edit comment: `PATCH /api/comments/:id` with `{ "body": "Edited" }`
- [ ] Delete comment with no replies → hard deleted
- [ ] Delete comment with replies → soft deleted, shows placeholder
- [ ] Like/unlike → `likedByMe` toggles in response
- [ ] Paginate: `?page=1&limit=5&sort=newest`
- [ ] Lazy-load replies: `GET /api/comments/:id/replies?page=1&limit=10`

### Frontend
- [ ] Start web server: `npm run dev:web`
- [ ] Navigate to test detail page → click "Discussion" tab
- [ ] Post a comment → appears in list
- [ ] Reply to a comment → appears indented
- [ ] Reply to a reply → appears at depth 2, no further Reply button shown
- [ ] Edit own comment → inline textarea, save/cancel
- [ ] Delete own comment → confirmation dialog, comment removed or shows deleted placeholder
- [ ] Like/unlike → heart toggles, count updates
- [ ] "View more replies" → loads additional replies
- [ ] "Load more comments" → loads next page
- [ ] Sort toggle → switches between newest/oldest
- [ ] Anonymous user → can read comments, prompted to sign in on action
- [ ] Empty comment → send button disabled
- [ ] Auto-refresh → new comments appear within 30s
