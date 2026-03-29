# Chat & Friendship System - Technical Specification

**Version:** 1.0
**Date:** 2026-03-26
**Status:** Ready for implementation

---

# 1. Overview

## 1.1 Purpose

Add a real-time chat and friendship system to the IELTS AI Learning Platform, enabling students to connect with each other, have one-to-one conversations, and participate in group study chats.

## 1.2 Scope

### In scope
- Friendship lifecycle: send request, accept, reject, unfriend, block, unblock
- One-to-one direct messaging between two users
- Group conversations with admin/member roles
- Real-time message delivery via WebSocket (Socket.io)
- Typing indicators with auto-expiry
- Online/offline presence tracking
- Unread message counts
- Read receipts (per-conversation, not per-message)
- Cursor-based message pagination
- User search for adding friends
- Chat and friends UI pages in the learner route group

### Out of scope
- File/image upload in messages (MessageType.IMAGE exists in schema for future use, but no upload flow)
- Voice/video calls
- Message reactions/emoji
- Message editing/deletion
- Push notifications (browser or mobile)
- Redis caching (documented as future improvement)
- End-to-end encryption
- Admin moderation tools for chat

---

# 2. Functional Requirements

## 2.1 Friendship System

### FR-1: Send Friend Request
- **Actor:** Authenticated user
- **Action:** Send a friend request to another user by their userId
- **Preconditions:**
  - Target user exists and `isActive = true`
  - Target user is not the current user
  - No friendship row exists between the two users in either direction (regardless of status)
- **Postcondition:** A `Friendship` row is created with `status = PENDING`, `requesterId = currentUser`, `addresseeId = target`
- **Edge cases:**
  - If a friendship already exists (PENDING, ACCEPTED, or BLOCKED) in either direction (`A->B` or `B->A`), return `409 ALREADY_EXISTS`
  - If target user does not exist or `isActive = false`, return `404 USER_NOT_FOUND`

### FR-2: Respond to Friend Request
- **Actor:** The addressee of a PENDING friendship
- **Action:** Accept or reject
- **Accept behavior:** Update `status` to `ACCEPTED`, update `updatedAt`
- **Reject behavior:** Hard-delete the `Friendship` row from the database
- **Preconditions:**
  - Friendship exists with `status = PENDING`
  - Current user is the `addresseeId`
- **Edge cases:**
  - If current user is the requester (not addressee), return `403 NOT_ADDRESSEE`
  - If friendship status is not PENDING, return `409 NOT_PENDING`
  - If friendship row was deleted between fetch and respond (race), return `404 NOT_FOUND`

### FR-3: Unfriend
- **Actor:** Either party of an ACCEPTED friendship
- **Action:** Remove the friendship
- **Behavior:** Hard-delete the `Friendship` row
- **Preconditions:** Friendship exists with `status = ACCEPTED`, current user is either `requesterId` or `addresseeId`
- **Side effects:** Does NOT delete any DIRECT conversation between the two users. Existing conversations and messages are preserved.

### FR-4: Block User
- **Actor:** Either party of any existing friendship
- **Action:** Block the other user
- **Behavior:** Set `status = BLOCKED`. The `requesterId` field is re-written to the blocker's userId (so only the blocker can unblock). The `addresseeId` becomes the blocked user.
- **Preconditions:** A friendship row exists between the two users. Status is not already `BLOCKED`.
- **Side effects:** Blocked users cannot send friend requests to the blocker. Blocked users are excluded from user search results for the blocker.

### FR-5: Unblock User
- **Actor:** The user who initiated the block (the `requesterId` of the BLOCKED row)
- **Action:** Unblock
- **Behavior:** Hard-delete the `Friendship` row. The two users return to "strangers" status.
- **Preconditions:** Friendship exists with `status = BLOCKED`, current user is `requesterId`

### FR-6: List Friends
- **Actor:** Authenticated user
- **Action:** View list of accepted friends
- **Behavior:** Return paginated list of users where a friendship with `status = ACCEPTED` exists, showing the other user's `id`, `displayName`, `avatarUrl`, `email`, and the friendship's `createdAt` as "friends since"
- **Features:** Offset pagination (`page`, `limit`), search by `displayName` (case-insensitive `ILIKE`)

### FR-7: List Friend Requests
- **Actor:** Authenticated user
- **Action:** View pending requests, filtered by `type` query param
- **`type=received`:** Return friendships where `addresseeId = currentUser` and `status = PENDING`. Response shows the requester's user info.
- **`type=sent`:** Return friendships where `requesterId = currentUser` and `status = PENDING`. Response shows the addressee's user info.

### FR-8: Check Friendship Status
- **Actor:** Authenticated user
- **Action:** Get the relationship status with a specific userId
- **Returns one of:**
  - `none` — no friendship row exists
  - `pending_sent` — current user is requester, status PENDING
  - `pending_received` — current user is addressee, status PENDING
  - `accepted` — status ACCEPTED
  - `blocked` — status BLOCKED (regardless of who blocked whom)
- **Also returns:** `friendshipId` (null if status is `none`)

## 2.2 Chat System

### FR-9: Create DIRECT Conversation
- **Actor:** Authenticated user
- **Action:** Start a one-to-one conversation with another user
- **Behavior:**
  1. Sort the two userIds lexicographically: `[userA, userB] = [currentUser, targetUser].sort()`
  2. Attempt `upsert` on `conversations` where `directUserA = userA AND directUserB = userB`
  3. If exists: return the existing conversation (status `200`)
  4. If new: create conversation with `type = DIRECT`, both users as `MEMBER`, status `201`
- **Preconditions:** Target user exists. Target user is not self.
- **No friendship requirement:** Users do NOT need to be friends to start a direct conversation. (This is a design decision — the platform encourages open communication among learners.)
- **Race condition handling:** The `@@unique([directUserA, directUserB])` constraint prevents duplicate conversations even under concurrent requests. The `upsert` pattern ensures both concurrent callers receive the same conversation.

### FR-10: Create GROUP Conversation
- **Actor:** Authenticated user
- **Action:** Create a group conversation with a name and initial members
- **Behavior:**
  1. Create conversation with `type = GROUP`, `name = provided name`, `createdBy = currentUser`
  2. Add current user as `ConversationMember` with `role = ADMIN`
  3. Add each provided member as `ConversationMember` with `role = MEMBER`
- **Preconditions:**
  - `name` is provided and is 2-100 characters
  - `memberIds` contains at least 1 userId (+ creator = minimum 2 total members)
  - All memberIds reference existing, active users
  - `directUserA` and `directUserB` are left `null` for GROUP conversations

### FR-11: List Conversations
- **Actor:** Authenticated user
- **Action:** View all conversations the user is a member of
- **Response includes for each conversation:**
  - Conversation metadata (id, type, name, avatarUrl, updatedAt)
  - `unreadCount`: computed as `conversation.lastMessageSeq - member.lastReadSeq` (integer subtraction, no extra query)
  - `lastMessage`: the most recent message (id, content, type, senderName, createdAt). Fetched via a subquery joining `messages` where `seqNumber = conversation.lastMessageSeq`
  - `members`: For DIRECT — the other user only (exclude self). For GROUP — all members.
- **Ordering:** `updatedAt DESC` (most recently active conversation first)
- **Pagination:** Offset-based (`page`, `limit`, default 20)

### FR-12: Get Conversation Detail
- **Actor:** Authenticated user who is a member
- **Action:** View full conversation info including all members with roles
- **Authorization:** Return `403 NOT_MEMBER` if the user is not in `conversation_members` for this conversation

### FR-13: Send Message
- **Actor:** Authenticated user who is a member of the conversation
- **Channel:** WebSocket event `send_message`
- **Behavior (step-by-step):**
  1. Gateway receives the event with payload `{ conversationId, content, type, clientId }`
  2. **Rate limit check:** Look up `rateLimitMap[userId]`. Filter timestamps to last 5 seconds. If `count >= 10`, return error callback `{ success: false, error: 'RATE_LIMITED' }` and stop.
  3. **Membership check:** Query `conversation_members` for `(conversationId, userId)`. If not found, return error callback `{ success: false, error: 'NOT_MEMBER' }`.
  4. **Validation:** `content` must be non-empty string (max 5000 chars). `clientId` must be a non-empty string. `type` defaults to `TEXT` if not provided.
  5. **Persist message (in a Prisma transaction):**
     ```
     a. UPDATE conversations SET lastMessageSeq = lastMessageSeq + 1, updatedAt = NOW()
        WHERE id = conversationId
        RETURNING lastMessageSeq
     b. INSERT INTO messages (id, conversationId, senderId, type, content, clientId, seqNumber, createdAt)
        VALUES (cuid(), conversationId, senderId, type, content, clientId, lastMessageSeq, NOW())
     ```
  6. **Idempotency:** If step 5b fails due to `UNIQUE(conversationId, clientId)` violation, this is a duplicate. Query the existing message by `(conversationId, clientId)` and return it. Do NOT increment `lastMessageSeq` again (the transaction rolls back).
  7. **Broadcast:** `socket.to('conversation:' + conversationId).emit('new_message', messagePayload)` — this sends to all sockets in the room EXCEPT the sender.
  8. **Acknowledge sender:** Call the Socket.io callback with `{ success: true, message: savedMessage }`. The sender uses this to confirm the optimistic message.
- **Message payload shape** (used in both `new_message` event and ack):
  ```json
  {
    "id": "cuid",
    "conversationId": "cuid",
    "senderId": "cuid",
    "content": "string",
    "type": "TEXT",
    "seqNumber": 48,
    "createdAt": "ISO8601",
    "sender": { "id": "cuid", "displayName": "string", "avatarUrl": "string|null" }
  }
  ```

### FR-14: Fetch Messages (Pagination)
- **Actor:** Authenticated member of the conversation
- **Channel:** REST `GET /api/chat/conversations/:id/messages`
- **Pagination strategy:** Cursor-based using message `id`
  - First request: omit `before` param -> returns the latest `limit` messages
  - Subsequent requests: pass `before = oldestLoadedMessageId` -> returns messages older than that cursor
- **Query:** `WHERE conversationId = :id AND id < :before ORDER BY id DESC LIMIT :limit`
  - Uses the `@@index([conversationId, id])` composite index
  - `limit` defaults to 30, max 50
- **Response:** `{ data: Message[], hasMore: boolean }`
  - `hasMore = true` if the query returned `limit` rows (there may be older messages)
  - Messages are returned newest-first (client reverses for display)

### FR-15: Mark Read
- **Actor:** Authenticated member of the conversation
- **Channels:** Both REST (`PATCH /api/chat/conversations/:id/read`) and WebSocket (`mark_read`)
- **Behavior:** Update `conversation_members.lastReadSeq = seqNumber` for the current user
- **Validation:**
  - `seqNumber` must be `<= conversation.lastMessageSeq` (cannot mark future messages as read)
  - `seqNumber` must be `>= member.lastReadSeq` (cannot go backwards)
  - If either fails, silently ignore (not an error — prevents client bugs from corrupting state)
- **Broadcast:** After DB update, emit `message_read` to the conversation room with `{ conversationId, userId, lastReadSeq }`

### FR-16: Update Group Conversation
- **Actor:** Authenticated user with `role = ADMIN` in the group
- **Action:** Update `name` and/or `avatarUrl`
- **Preconditions:** Conversation `type = GROUP`. User's `ConversationMember.role = ADMIN`.
- **Validation:** `name` must be 2-100 characters if provided.

### FR-17: Add Members to Group
- **Actor:** Authenticated user with `role = ADMIN` in the group
- **Action:** Add one or more users to the group
- **Behavior:** Create `ConversationMember` rows with `role = MEMBER` for each new user. Insert a `SYSTEM` message: `"{adminName} added {newMemberName}"`.
- **Validation:** All userIds must be valid active users. Skip userIds that are already members (idempotent).
- **Side effect:** If any of the new members are currently connected via WebSocket, they need to join the room. The gateway should emit a `conversation:added` event to those users' sockets so their client can call `join_conversation`.

### FR-18: Remove Member / Leave Group
- **Actor:** Any member (leave self) or ADMIN (remove others)
- **Self-leave:** Any user can `DELETE /api/chat/conversations/:id/members/:ownUserId` to leave the group. Delete their `ConversationMember` row. Insert `SYSTEM` message: `"{userName} left the group"`.
- **Remove other:** Only `ADMIN` can remove another member. Delete the target's `ConversationMember` row. Insert `SYSTEM` message: `"{adminName} removed {memberName}"`.
- **Last member leaves:** If the group has 0 remaining members after removal, delete the entire conversation and all its messages (cascade).
- **ADMIN leaves with remaining members:** The longest-tenured remaining member is automatically promoted to `ADMIN`.
- **DIRECT conversations:** Return `400 NOT_GROUP`. Members cannot be removed from DIRECT conversations.

### FR-19: Typing Indicators
- **Channel:** WebSocket only, no DB writes
- **`typing_start` flow:**
  1. Client emits `typing_start { conversationId }`
  2. Server looks up typing timeout key `${conversationId}:${userId}`
  3. If a timeout exists, clear it
  4. Set a new 5-second timeout that auto-fires `user_stop_typing` to the room
  5. Broadcast `user_typing { conversationId, userId, displayName }` to the room (excluding sender via `socket.to(room)`)
- **`typing_stop` flow:**
  1. Client emits `typing_stop { conversationId }`
  2. Server clears the timeout for this key
  3. Broadcast `user_stop_typing { conversationId, userId }` to the room (excluding sender)
- **Disconnect cleanup:**
  1. When a user disconnects, iterate all active typing timeout keys for this userId
  2. Clear each timeout
  3. For each, broadcast `user_stop_typing` to the respective room
- **Client-side debounce:**
  - Emit `typing_start` on input change, debounced to 300ms
  - Emit `typing_stop` after 3 seconds of inactivity or on message send
  - Client-side safety: auto-clear typing indicator after 6 seconds of no `user_typing` re-emission (in case server's `user_stop_typing` is lost)

### FR-20: Online/Offline Presence
- **Data structure:** In-memory `Map<string, Set<string>>` mapping `userId -> Set<socketId>`
- **Connect:** Add `socketId` to the user's set. If the set went from size 0 to 1 (user came online), broadcast `user_online { userId }` to all connected sockets in rooms the user belongs to.
- **Disconnect:** Remove `socketId` from the user's set. If the set is now empty (user's last tab closed), broadcast `user_offline { userId, lastSeen: new Date().toISOString() }` to relevant sockets.
- **Multi-tab support:** A user with 3 open tabs has 3 socketIds in their set. They only go "offline" when all 3 disconnect.
- **Querying online users:** The presence map is read by the gateway to determine online status. No DB queries needed.
- **Limitation:** This is in-memory and lost on server restart. After restart, all users appear offline until they reconnect. Acceptable for single-server.

### FR-21: User Search
- **Actor:** Authenticated user
- **Action:** Search for users by displayName or email to add as friends
- **Channel:** REST `GET /api/users/search?q=...&limit=10`
- **Query:** `WHERE (displayName ILIKE '%q%' OR email ILIKE '%q%') AND id != currentUserId AND isActive = true`
- **Filtering:** Exclude users who have blocked the current user (check Friendship table for BLOCKED status where `addresseeId = currentUser`)
- **Minimum query length:** 2 characters. Return empty array if `q.length < 2`.
- **Limit:** Default 10, max 20.

---

# 3. System Design

## 3.1 Architecture

```
                    ┌──────────────────────────────────────────┐
                    │          NestJS Application               │
                    │                                          │
 Browser ──REST──>  │  [FriendshipsController] ──> [Service]   │ ──> PostgreSQL
                    │  [ChatController]        ──> [Service]   │
                    │  [UsersController]       ──> [Service]   │
                    │                                          │
 Browser ──WS────>  │  [ChatGateway]           ──> [Service]   │
                    │    ├─ presenceMap (in-memory)             │
                    │    ├─ typingTimeouts (in-memory)          │
                    │    └─ rateLimitMap (in-memory)            │
                    └──────────────────────────────────────────┘
```

- Single NestJS process serves both REST and WebSocket on the same port (4000)
- NestJS `@WebSocketGateway` uses the same underlying HTTP server
- All business logic lives in services; gateway and controllers are thin wrappers
- Three in-memory maps in the gateway: presence, typing timeouts, rate limits
- No message broker, no Redis, no microservices

## 3.2 Module Dependency Graph

```
AppModule
  ├── PrismaModule (global)
  ├── AuthModule (JwtModule, JwtStrategy, UsersModule)
  ├── UsersModule (new: adds search endpoint)
  ├── FriendshipsModule (exports FriendshipsService)
  └── ChatModule (imports FriendshipsModule, JwtModule)
        ├── ChatController (REST)
        ├── ChatService (DB operations)
        └── ChatGateway (WebSocket)
```

## 3.3 Backend File Structure

```
apps/api/src/
  friendships/
    friendships.module.ts
    friendships.controller.ts
    friendships.service.ts
    dto/
      send-friend-request.dto.ts          # { addresseeId: string }
      respond-friend-request.dto.ts       # { action: 'accept' | 'reject' }
      query-friends.dto.ts                # { page?, limit?, search? }

  chat/
    chat.module.ts
    chat.controller.ts
    chat.service.ts
    chat.gateway.ts
    dto/
      create-conversation.dto.ts          # { type, memberId?, memberIds?, name? }
      query-messages.dto.ts               # { limit?, before? }
      send-message.dto.ts                 # { conversationId, content, type?, clientId }
      update-group.dto.ts                 # { name?, avatarUrl? }
      add-members.dto.ts                  # { userIds: string[] }
      mark-read.dto.ts                    # { seqNumber: number }

  users/
    users.controller.ts                   # Add GET /users/search endpoint
    users.service.ts                      # Add searchUsers method
```

## 3.4 Frontend File Structure

```
apps/web/src/
  lib/
    socket.ts                              # Socket.io singleton manager
    chat-store.ts                          # Zustand: activeConversation, typing, online, sidebar toggle

  features/
    chat/hooks/
      use-chat.ts                          # useConversations, useMessages, useCreateConversation, useMarkRead
      use-socket-events.ts                 # Socket event listener hook

    friendships/hooks/
      use-friendships.ts                   # useFriends, useFriendRequests, useSendRequest, useRespond, useUnfriend

  components/
    chat/
      chat-layout.tsx                      # Sidebar + message area split
      conversation-list.tsx                # Search + conversation items
      conversation-item.tsx                # Single row: avatar, name, last msg, unread, time
      message-area.tsx                     # Header + scroll area + input
      message-bubble.tsx                   # Left/right aligned bubble
      message-input.tsx                    # Textarea + send
      typing-indicator.tsx                 # Animated dots
      create-group-modal.tsx               # Dialog: name + member selection
      group-info-drawer.tsx                # Sheet: members, roles, leave
      date-separator.tsx                   # Day divider line
      new-messages-pill.tsx                # Floating "New messages" button

    friends/
      friends-list.tsx                     # Card grid
      friend-card.tsx                      # Avatar, name, message/unfriend buttons
      friend-requests.tsx                  # Received + sent sections
      friend-request-card.tsx              # Accept/reject/cancel
      user-search-modal.tsx                # Search + add friend

  app/(learner)/
    chat/page.tsx                          # Chat page
    friends/page.tsx                       # Friends page
```

---

# 4. API Design

## 4.1 Friendship Endpoints

### POST /api/friendships/request
- **Auth:** JwtAuthGuard
- **Request:** `{ "addresseeId": "string" }` — `@IsString() @IsNotEmpty()`
- **Response 201:** `{ id, requesterId, addresseeId, status: "PENDING", createdAt }`
- **Errors:** `400 SELF_REQUEST`, `404 USER_NOT_FOUND`, `409 ALREADY_EXISTS`
- **Service logic:**
  1. Check `addresseeId !== currentUser.id`
  2. Check `User.findUnique({ where: { id: addresseeId, isActive: true } })`
  3. Check no existing friendship: query `WHERE (requesterId = A AND addresseeId = B) OR (requesterId = B AND addresseeId = A)`
  4. Create friendship

### PATCH /api/friendships/:id/respond
- **Auth:** JwtAuthGuard
- **Request:** `{ "action": "accept" | "reject" }` — `@IsEnum(['accept', 'reject'])`
- **Response 200 (accept):** `{ id, status: "ACCEPTED", requester: UserSummary, addressee: UserSummary }`
- **Response 200 (reject):** `{ message: "Friend request rejected" }`
- **Errors:** `403 NOT_ADDRESSEE`, `404 NOT_FOUND`, `409 NOT_PENDING`
- **Service logic:**
  1. Find friendship by id, include requester and addressee
  2. Check `friendship.addresseeId === currentUser.id`
  3. Check `friendship.status === 'PENDING'`
  4. Accept: `update({ status: 'ACCEPTED' })`. Reject: `delete({ where: { id } })`

### DELETE /api/friendships/:id
- **Auth:** JwtAuthGuard
- **Response 200:** `{ message: "Friendship removed" }`
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`
- **Service logic:**
  1. Find friendship by id
  2. Check currentUser is requester or addressee
  3. Check `status === 'ACCEPTED'`
  4. `delete({ where: { id } })`

### POST /api/friendships/:id/block
- **Auth:** JwtAuthGuard
- **Response 200:** `{ id, status: "BLOCKED" }`
- **Errors:** `404 NOT_FOUND`, `409 ALREADY_BLOCKED`
- **Service logic:**
  1. Find friendship by id
  2. Check currentUser is part of it
  3. Check status is not BLOCKED
  4. Update: `status = BLOCKED`, `requesterId = currentUser.id`, `addresseeId = otherUser.id`

### DELETE /api/friendships/:id/block
- **Auth:** JwtAuthGuard
- **Response 200:** `{ message: "User unblocked" }`
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`
- **Service logic:**
  1. Find friendship by id
  2. Check `status === 'BLOCKED'` and `requesterId === currentUser.id`
  3. `delete({ where: { id } })`

### GET /api/friendships
- **Auth:** JwtAuthGuard
- **Query:** `page` (default 1), `limit` (default 20, max 50), `search` (optional string)
- **Response 200:** `{ data: [{ friendshipId, user: UserSummary, since }], total, page, limit }`
- **Service logic:**
  ```
  WHERE status = 'ACCEPTED'
    AND (requesterId = currentUser OR addresseeId = currentUser)
    AND (otherUser.displayName ILIKE '%search%')  -- if search provided
  ORDER BY createdAt DESC
  SKIP (page - 1) * limit
  TAKE limit
  ```
  Map results to show the "other" user (if currentUser is requester, show addressee; vice versa).

### GET /api/friendships/requests
- **Auth:** JwtAuthGuard
- **Query:** `type` (required: `'sent'` | `'received'`)
- **Response 200:** `{ data: [{ id, user: UserSummary, createdAt }] }`
- **Service logic:**
  - `type = 'received'`: `WHERE addresseeId = currentUser AND status = 'PENDING'`, return requester info
  - `type = 'sent'`: `WHERE requesterId = currentUser AND status = 'PENDING'`, return addressee info

### GET /api/friendships/status/:userId
- **Auth:** JwtAuthGuard
- **Response 200:** `{ status: 'none'|'pending_sent'|'pending_received'|'accepted'|'blocked', friendshipId: string|null }`
- **Service logic:**
  Query `WHERE (requesterId = currentUser AND addresseeId = :userId) OR (requesterId = :userId AND addresseeId = currentUser)`.
  Map the result to the appropriate status string based on who is requester/addressee and the status enum.

## 4.2 Chat Endpoints

### POST /api/chat/conversations
- **Auth:** JwtAuthGuard
- **Request (DIRECT):** `{ "type": "DIRECT", "memberId": "string" }`
- **Request (GROUP):** `{ "type": "GROUP", "name": "string", "memberIds": ["string"] }`
- **Validation DTO:** `type` is `@IsEnum(ConversationType)`. Conditional validation: if DIRECT, `memberId` required; if GROUP, `name` and `memberIds` required.
- **Response 200/201:** Full conversation object with members
- **Errors:** `400 SELF_CONVERSATION`, `400 INVALID_TYPE`, `400 MIN_MEMBERS`, `404 USER_NOT_FOUND`
- **DIRECT service logic:**
  ```typescript
  const [userA, userB] = [currentUserId, dto.memberId].sort();
  return prisma.conversation.upsert({
    where: { directUserA_directUserB: { directUserA: userA, directUserB: userB } },
    create: {
      type: 'DIRECT',
      directUserA: userA,
      directUserB: userB,
      members: {
        create: [
          { userId: userA, role: 'MEMBER' },
          { userId: userB, role: 'MEMBER' },
        ],
      },
    },
    update: {},
    include: { members: { include: { user: true } } },
  });
  ```
- **GROUP service logic:**
  ```typescript
  return prisma.conversation.create({
    data: {
      type: 'GROUP',
      name: dto.name,
      createdBy: currentUserId,
      members: {
        create: [
          { userId: currentUserId, role: 'ADMIN' },
          ...dto.memberIds.map(id => ({ userId: id, role: 'MEMBER' })),
        ],
      },
    },
    include: { members: { include: { user: true } } },
  });
  ```

### GET /api/chat/conversations
- **Auth:** JwtAuthGuard
- **Query:** `page` (default 1), `limit` (default 20)
- **Response 200:** `{ data: ConversationWithMeta[], total, page, limit }`
- **Service logic (Prisma):**
  ```typescript
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: currentUserId },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
          messages: {
            orderBy: { seqNumber: 'desc' },
            take: 1,
            include: { sender: { select: { id: true, displayName: true } } },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
    skip: (page - 1) * limit,
    take: limit,
  });
  // Map to response: compute unreadCount = conv.lastMessageSeq - membership.lastReadSeq
  ```

### GET /api/chat/conversations/:id
- **Auth:** JwtAuthGuard
- **Response 200:** Full conversation with all members and their roles
- **Authorization:** Check `conversation_members` for `(conversationId, currentUserId)`. If not found, `403 NOT_MEMBER`.

### GET /api/chat/conversations/:id/messages
- **Auth:** JwtAuthGuard
- **Query:** `limit` (default 30, max 50), `before` (optional message id cursor)
- **Response 200:** `{ data: Message[], hasMore: boolean }`
- **Authorization:** Check membership first.
- **Service logic:**
  ```typescript
  const where: any = { conversationId: id };
  if (before) where.id = { lt: before };

  const messages = await prisma.message.findMany({
    where,
    orderBy: { id: 'desc' },
    take: limit + 1, // fetch one extra to determine hasMore
    include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop(); // remove the extra

  return { data: messages, hasMore };
  ```

### PATCH /api/chat/conversations/:id
- **Auth:** JwtAuthGuard
- **Request:** `{ "name"?: "string", "avatarUrl"?: "string" }`
- **Authorization:** Check `type = GROUP` and `member.role = ADMIN`
- **Response 200:** Updated conversation

### POST /api/chat/conversations/:id/members
- **Auth:** JwtAuthGuard
- **Request:** `{ "userIds": ["string"] }`
- **Authorization:** Check `type = GROUP` and `member.role = ADMIN`
- **Response 201:** `{ added: [{ userId, displayName }] }`
- **Service logic:** Use `createMany` with `skipDuplicates: true` to handle already-existing members.

### DELETE /api/chat/conversations/:id/members/:userId
- **Auth:** JwtAuthGuard
- **Authorization:** If `:userId === currentUser` -> leave (any role). If `:userId !== currentUser` -> must be ADMIN.
- **Response 200:** `{ message: "Member removed" }`
- **Service logic:**
  1. Delete the `ConversationMember` row
  2. Insert SYSTEM message (e.g., "John left the group")
  3. Count remaining members. If 0, delete conversation.
  4. If leaving user was ADMIN, promote oldest remaining member.

### PATCH /api/chat/conversations/:id/read
- **Auth:** JwtAuthGuard
- **Request:** `{ "seqNumber": number }`
- **Response 200:** `{ lastReadSeq: number }`
- **Service logic:**
  ```typescript
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId: currentUserId } },
    data: { lastReadSeq: Math.min(seqNumber, conversation.lastMessageSeq) },
  });
  ```

### GET /api/users/search
- **Auth:** JwtAuthGuard
- **Query:** `q` (required, min 2 chars), `limit` (default 10, max 20)
- **Response 200:** `{ data: [{ id, displayName, email, avatarUrl }] }`
- **Service logic:**
  ```typescript
  const blockedByIds = await prisma.friendship.findMany({
    where: { addresseeId: currentUserId, status: 'BLOCKED' },
    select: { requesterId: true },
  });
  const excludeIds = [currentUserId, ...blockedByIds.map(f => f.requesterId)];

  return prisma.user.findMany({
    where: {
      id: { notIn: excludeIds },
      isActive: true,
      OR: [
        { displayName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, displayName: true, email: true, avatarUrl: true },
    take: limit,
  });
  ```

---

# 5. Data Model

## 5.1 Prisma Schema (complete)

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
  BLOCKED
}

enum ConversationType {
  DIRECT
  GROUP
}

enum MessageType {
  TEXT
  IMAGE
  SYSTEM
}

enum MemberRole {
  ADMIN
  MEMBER
}

model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  requester User @relation("FriendshipRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee User @relation("FriendshipAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])
  @@map("friendships")
}

model Conversation {
  id             String           @id @default(cuid())
  type           ConversationType @default(DIRECT)
  name           String?
  avatarUrl      String?
  createdBy      String?
  lastMessageSeq Int              @default(0)
  directUserA    String?
  directUserB    String?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  members  ConversationMember[]
  messages Message[]

  @@unique([directUserA, directUserB])
  @@index([updatedAt])
  @@map("conversations")
}

model ConversationMember {
  id             String     @id @default(cuid())
  conversationId String
  userId         String
  role           MemberRole @default(MEMBER)
  lastReadSeq    Int        @default(0)
  joinedAt       DateTime   @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([userId])
  @@map("conversation_members")
}

model Message {
  id             String      @id @default(cuid())
  conversationId String
  senderId       String
  type           MessageType @default(TEXT)
  content        String
  clientId       String?
  seqNumber      Int
  createdAt      DateTime    @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@unique([conversationId, clientId])
  @@unique([conversationId, seqNumber])
  @@index([conversationId, id])
  @@map("messages")
}
```

## 5.2 User Model Additions

```prisma
// Add to existing User model:
sentFriendRequests     Friendship[]         @relation("FriendshipRequester")
receivedFriendRequests Friendship[]         @relation("FriendshipAddressee")
conversationMembers    ConversationMember[]
messages               Message[]
```

## 5.3 Indexing Strategy

| Table | Index | Purpose |
|-------|-------|---------|
| friendships | `UNIQUE(requesterId, addresseeId)` | Prevent duplicate friendships, fast lookup by pair |
| friendships | `INDEX(addresseeId, status)` | Fast query for received requests (filtered by PENDING) |
| conversations | `UNIQUE(directUserA, directUserB)` | Prevent duplicate DIRECT conversations, race-condition-safe upsert |
| conversations | `INDEX(updatedAt)` | Fast ordering for conversation list |
| conversation_members | `UNIQUE(conversationId, userId)` | Prevent duplicate membership, fast membership check |
| conversation_members | `INDEX(userId)` | Fast query for "all conversations of a user" |
| messages | `UNIQUE(conversationId, clientId)` | Idempotent message insertion |
| messages | `UNIQUE(conversationId, seqNumber)` | Guarantee unique sequential ordering |
| messages | `INDEX(conversationId, id)` | Efficient cursor-based pagination |

---

# 6. Real-time Behavior

## 6.1 WebSocket Connection Lifecycle

### Connection
```
Client: io('http://localhost:4000/chat', { auth: { token } })
Server handleConnection(socket):
  1. token = socket.handshake.auth.token
  2. try { payload = jwtService.verify(token) } catch { socket.emit('auth_error'); socket.disconnect(true); return }
  3. socket.data.user = { id: payload.sub, email: payload.email, role: payload.role }
  4. presenceMap.get(userId)?.add(socket.id) ?? presenceMap.set(userId, new Set([socket.id]))
  5. if presenceMap.get(userId).size === 1: broadcastToRelevantUsers('user_online', { userId })
```

### Disconnection
```
Server handleDisconnect(socket):
  1. userId = socket.data.user?.id  (may be null if auth failed)
  2. if !userId: return
  3. presenceMap.get(userId)?.delete(socket.id)
  4. if presenceMap.get(userId)?.size === 0:
     a. presenceMap.delete(userId)
     b. clearAllTypingTimeouts(userId)
     c. broadcastToRelevantUsers('user_offline', { userId, lastSeen: new Date().toISOString() })
```

## 6.2 Event Reference

### Client -> Server

| Event | Payload | Handler | Response |
|-------|---------|---------|----------|
| `send_message` | `{ conversationId, content, type?, clientId }` | Rate limit -> validate membership -> save to DB -> broadcast | Ack callback: `{ success, message? , error? }` |
| `join_conversation` | `{ conversationId }` | Validate membership -> `socket.join(room)` | Ack: `{ success: true }` |
| `leave_conversation` | `{ conversationId }` | `socket.leave(room)` | None |
| `mark_read` | `{ conversationId, seqNumber }` | Update DB -> broadcast | None |
| `typing_start` | `{ conversationId }` | Set/reset TTL -> broadcast to room | None |
| `typing_stop` | `{ conversationId }` | Clear TTL -> broadcast to room | None |

### Server -> Client

| Event | Payload | When emitted |
|-------|---------|-------------|
| `new_message` | `{ id, conversationId, senderId, content, type, seqNumber, createdAt, sender }` | Message saved to DB. Sent to room excluding sender. |
| `message_read` | `{ conversationId, userId, lastReadSeq }` | User marks conversation as read |
| `user_typing` | `{ conversationId, userId, displayName }` | User starts typing. Sent to room excluding sender. |
| `user_stop_typing` | `{ conversationId, userId }` | User stops typing or TTL expires or disconnect. Sent to room excluding sender. |
| `user_online` | `{ userId }` | First socket connects for a user |
| `user_offline` | `{ userId, lastSeen }` | Last socket disconnects for a user |
| `auth_error` | `{ message: "Token expired" }` | JWT verification fails on connect |

## 6.3 Room Naming

Format: `conversation:{conversationId}`

Example: `conversation:clx1234abcd`

---

# 7. Business Logic

## 7.1 Message Creation (Transaction)

```typescript
async createMessage(conversationId: string, senderId: string, content: string, type: MessageType, clientId: string) {
  try {
    return await this.prisma.$transaction(async (tx) => {
      // Step 1: Increment seq and get new value
      const conv = await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageSeq: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      // Step 2: Insert message with the new seq
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId,
          type,
          content,
          clientId,
          seqNumber: conv.lastMessageSeq,
        },
        include: {
          sender: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });

      return message;
    });
  } catch (error) {
    // Handle clientId uniqueness violation (idempotency)
    if (error.code === 'P2002' && error.meta?.target?.includes('clientId')) {
      return this.prisma.message.findFirst({
        where: { conversationId, clientId },
        include: {
          sender: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
    }
    throw error;
  }
}
```

## 7.2 DIRECT Conversation Dedup

```typescript
async createDirectConversation(currentUserId: string, targetUserId: string) {
  const [userA, userB] = [currentUserId, targetUserId].sort();

  return this.prisma.conversation.upsert({
    where: {
      directUserA_directUserB: { directUserA: userA, directUserB: userB },
    },
    create: {
      type: 'DIRECT',
      directUserA: userA,
      directUserB: userB,
      members: {
        create: [
          { userId: userA, role: 'MEMBER' },
          { userId: userB, role: 'MEMBER' },
        ],
      },
    },
    update: {}, // Return existing, don't modify
    include: {
      members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
    },
  });
}
```

## 7.3 Friendship Bidirectional Check

```typescript
async areFriends(userA: string, userB: string): Promise<boolean> {
  const friendship = await this.prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA },
      ],
    },
  });
  return !!friendship;
}
```

## 7.4 Validation Rules Summary

| Field | Rule |
|-------|------|
| `message.content` | Non-empty string, max 5000 characters |
| `message.clientId` | Non-empty string (UUID v4 format recommended but not enforced) |
| `group.name` | 2-100 characters |
| `search.q` | Minimum 2 characters |
| `pagination.limit` | Messages: 1-50 (default 30). Conversations/Friends: 1-50 (default 20). Search: 1-20 (default 10) |
| `mark_read.seqNumber` | Must be `>= 0`, `<= conversation.lastMessageSeq`, `>= member.lastReadSeq` |
| `friendship.addresseeId` | Must not equal current user. Must reference an active user. |

---

# 8. Edge Cases

## 8.1 Network & Connection

| Scenario | Behavior |
|----------|----------|
| Client disconnects mid-message | Transaction ensures DB consistency. Message is either saved or not. Client retries with same `clientId` — idempotent. |
| Client reconnects after brief disconnect | Socket.io auto-reconnects. Server re-authenticates JWT. Client re-fetches conversations and re-joins rooms. Any messages received during downtime are fetched via REST pagination. |
| Server restarts | All WebSocket connections drop. All in-memory state (presence, typing, rate limits) is lost. Clients reconnect automatically. All users appear offline until they reconnect. Messages in DB are preserved. |
| JWT expires during active session | WebSocket stays connected (JWT was only checked on initial connect). On next reconnect, the expired token is rejected. Client handles `auth_error` by refreshing the token and reconnecting. |

## 8.2 Duplicate & Race Conditions

| Scenario | Behavior |
|----------|----------|
| Duplicate message (same clientId) | `UNIQUE(conversationId, clientId)` constraint catches the duplicate. Transaction rolls back. Service returns the existing message. `lastMessageSeq` is not double-incremented. |
| Concurrent DIRECT conversation creation | `UNIQUE(directUserA, directUserB)` constraint. The `upsert` pattern ensures both requests return the same conversation. No duplicate created. |
| Two users block each other simultaneously | The first `UPDATE` succeeds. The second finds `status = BLOCKED` and returns `409 ALREADY_BLOCKED`. |
| Mark read with stale seqNumber | Validation ensures `seqNumber >= lastReadSeq`. If the value is stale but still valid, the update proceeds (it's idempotent — setting the same value twice is harmless). |
| User sends message to conversation they were just removed from | Membership check fails. Error callback `{ success: false, error: 'NOT_MEMBER' }`. |

## 8.3 Invalid Data

| Scenario | Behavior |
|----------|----------|
| Empty message content | Validation fails. Error callback `VALIDATION_ERROR`. |
| Message content > 5000 chars | Validation fails. Error callback `VALIDATION_ERROR`. |
| Non-existent conversationId | Membership query returns null. Error `NOT_MEMBER`. |
| Non-existent userId in add members | `prisma.user.findMany` returns fewer results. Service compares found vs requested and returns `404 USER_NOT_FOUND` for missing IDs. |
| Group name empty or > 100 chars | DTO validation rejects. Returns `400`. |

---

# 9. Performance Considerations

## 9.1 Database Query Optimization

| Query | Optimization |
|-------|-------------|
| List conversations with unread | `unreadCount = lastMessageSeq - lastReadSeq` computed in application layer. Single query with JOIN. No subquery or COUNT. |
| Message pagination | Cursor-based (`WHERE id < cursor`) backed by `@@index([conversationId, id])`. Constant time regardless of total message count. |
| Membership check | `@@unique([conversationId, userId])` provides index-backed O(1) lookup. |
| Friend list search | `ILIKE` on `displayName`. For large user bases, consider adding a `GIN` index on `displayName` in a future migration. |

## 9.2 WebSocket Efficiency

| Optimization | Detail |
|-------------|--------|
| Sender exclusion | `socket.to(room)` instead of `server.to(room)`. Prevents the sender from receiving their own message. |
| Explicit room joins | Client only joins rooms for conversations it is actively viewing. Reduces irrelevant event traffic. |
| No DB writes for typing | Typing events are purely in-memory. Zero database impact. |
| Typing TTL cleanup | Prevents memory leaks from abandoned typing states. |

## 9.3 Message Write Path

- **1 message = 1 DB transaction** (2 statements: UPDATE conversation, INSERT message)
- **No per-user writes.** No "message delivery" or "message receipt" table. Room broadcast handles delivery.
- **Idempotency via clientId** prevents accidental double-writes on retry.

## 9.4 Frontend Optimization

| Optimization | Detail |
|-------------|--------|
| Optimistic updates | Sender sees their message immediately in UI before server ack. Replaced with confirmed message on ack. |
| React Query cache | `new_message` socket events append directly to `['messages', convId]` cache. No refetch needed for the active conversation. |
| Conversations list invalidation | Only invalidated (background refetch) on `new_message` and `message_read` events. Not on every keystroke. |
| Infinite scroll | Messages loaded in pages of 30. Older messages loaded on scroll-to-top. |
| Client-side conversation filter | Search in sidebar filters loaded data. No server round-trip. |

---

# 10. Security

## 10.1 Authentication

| Layer | Mechanism |
|-------|-----------|
| REST | `Authorization: Bearer <accessToken>` header. Validated by `JwtAuthGuard` (Passport strategy). |
| WebSocket | `socket.handshake.auth.token`. Validated by `jwtService.verify()` in `handleConnection`. |
| Token refresh | Frontend intercepts 401 on REST, calls `/auth/refresh` with refresh token, retries. For WebSocket, `auth_error` event triggers disconnect -> refresh -> reconnect. |
| Token expiry | Access tokens expire in 15 minutes. Refresh tokens in 7 days. WebSocket connections are not proactively disconnected on token expiry (they were valid at connect time). |

## 10.2 Authorization

| Action | Rule |
|--------|------|
| Read messages | User must be a `ConversationMember` of the conversation |
| Send message | User must be a `ConversationMember` of the conversation |
| Update group | User must have `role = ADMIN` in the group |
| Add members | User must have `role = ADMIN` in the group |
| Remove member | Self-remove: any role. Remove other: `role = ADMIN` only |
| Respond to friend request | Only the `addresseeId` |
| Unblock | Only the user who blocked (the `requesterId` of the BLOCKED row) |

## 10.3 Rate Limiting

| Target | Limit | Window | Storage |
|--------|-------|--------|---------|
| `send_message` (WebSocket) | 10 messages | 5 seconds | In-memory Map per userId |

**Implementation:** On each `send_message`, filter the user's timestamp array to keep only entries from the last 5 seconds. If the array length >= 10, reject with `RATE_LIMITED`. Otherwise, push `Date.now()` and proceed.

## 10.4 Input Validation

| Input | Validation |
|-------|-----------|
| All REST DTOs | `class-validator` decorators (`@IsString`, `@IsNotEmpty`, `@IsEnum`, `@IsOptional`, `@MaxLength`, `@MinLength`) |
| WebSocket payloads | Manual validation in gateway handler (check required fields, types, lengths) before calling service |
| SQL injection | Prisma ORM parameterizes all queries. No raw SQL. |
| XSS | Message content is stored as-is. Frontend must sanitize when rendering (React auto-escapes JSX by default). |
| `conversationId` / `userId` params | Validated as non-empty strings. Prisma throws on invalid foreign key references. |

## 10.5 Abuse Prevention

| Threat | Mitigation |
|--------|-----------|
| Message spam | Rate limiter: 10 messages per 5 seconds per user |
| Mass friend requests | Unique constraint prevents duplicate requests. Could add rate limiter on `POST /friendships/request` if needed. |
| Unauthorized room join | `join_conversation` validates membership in DB before `socket.join` |
| Eavesdropping on other conversations | All message fetch endpoints check membership. WebSocket rooms require explicit join with validation. |
| Forged sender identity | `senderId` is always set from `socket.data.user.id` (from JWT), never from client payload |

---

# 11. Non-Functional Requirements

## 11.1 Scalability

- **Current target:** Single server, up to ~1000 concurrent WebSocket connections
- **Database connections:** Prisma connection pool (default 10 connections, configurable via `DATABASE_URL?connection_limit=20`)
- **Future horizontal scaling path:**
  1. Add `@nestjs/platform-socket.io` Redis adapter for multi-server Socket.io
  2. Move presence map from in-memory to Redis hash
  3. Move typing timeouts to Redis with TTL keys
  4. Move rate limiter to Redis sliding window
  5. No application code changes beyond swapping the adapter and stores

## 11.2 Reliability

- **Message persistence:** Messages are always saved to DB before broadcast. If broadcast fails, the message is still in the database. Client will see it on next conversation fetch.
- **Idempotent operations:** `clientId` dedup for messages, `upsert` for DIRECT conversations, `skipDuplicates` for member addition. Safe to retry any operation.
- **Graceful disconnect:** Typing indicators auto-clear. Presence auto-updates. No zombie state.
- **Data integrity:** Foreign keys with `CASCADE` delete. Prisma transactions for multi-table writes. Unique constraints prevent duplicates.

## 11.3 Maintainability

- **Module boundaries:** `FriendshipsModule` and `ChatModule` are self-contained. Each has its own controller, service, DTOs.
- **Consistent patterns:** Follows the same NestJS patterns as existing modules (Auth, Comments, Attempts): guards, decorators, Prisma injection, DTO validation.
- **Testability:** Services contain all business logic. Gateway is a thin wrapper. Services can be unit-tested with mocked PrismaService.
- **Type safety:** Prisma-generated types for all models and enums. TypeScript throughout.

## 11.4 Monitoring (recommendations)

- Log WebSocket connection/disconnection with userId
- Log message creation failures (DB errors, rate limit hits)
- Track active WebSocket connection count (expose via health endpoint or metric)
- Track presence map size as a proxy for online user count

---

# 12. Dependencies

## 12.1 New npm Packages

**Backend (`apps/api`):**
```
@nestjs/websockets        # NestJS WebSocket abstraction
@nestjs/platform-socket.io  # Socket.io adapter for NestJS
```

**Frontend (`apps/web`):**
```
socket.io-client           # Socket.io client library
```

## 12.2 Existing Packages Used

| Package | Usage |
|---------|-------|
| `@nestjs/jwt` | JWT verification in WebSocket gateway |
| `@prisma/client` | All database operations |
| `class-validator` / `class-transformer` | DTO validation |
| `@tanstack/react-query` | Server state management (conversations, messages, friends) |
| `zustand` | UI-only state (typing, online, active conversation) |
| `sonner` | Toast notifications |
| `lucide-react` | Icons |

---

# 13. Migration Checklist

```bash
# 1. Install backend dependencies
cd apps/api && npm install @nestjs/websockets @nestjs/platform-socket.io

# 2. Update Prisma schema (add enums, models, User relations)
# Edit apps/api/prisma/schema.prisma

# 3. Run migration
npx prisma migrate dev --name add_friendship_and_chat

# 4. Install frontend dependency
cd apps/web && npm install socket.io-client

# 5. Verify
npx prisma generate
npm run build  # Both apps should compile
```
