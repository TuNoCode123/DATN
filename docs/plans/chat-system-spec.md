# Chat System - Technical Specification

**Version:** 1.0
**Date:** 2026-03-26
**Status:** Ready for implementation

---

# 1. Overview

## 1.1 Purpose

Add a real-time messaging system to the IELTS AI Learning Platform. Students can have direct one-to-one conversations and participate in group study chats with real-time message delivery, typing indicators, read tracking, and online presence.

## 1.2 Scope

### In scope
- Direct (1-to-1) messaging between any two users
- Group conversations with admin/member roles
- Real-time message delivery via WebSocket (Socket.io)
- Typing indicators with auto-expiry
- Online/offline presence tracking
- Unread message counts per conversation
- Read receipts (per-conversation, not per-message)
- Cursor-based message pagination
- Optimistic message sending with idempotency
- System messages for group events (member joined, left, removed)

### Out of scope
- File/image upload (schema supports `IMAGE` type for future use, no upload flow now)
- Voice/video calls
- Message reactions, editing, or deletion
- Push notifications (browser or mobile)
- Redis caching (future improvement)
- End-to-end encryption
- Admin moderation tools

---

# 2. Functional Requirements

## 2.1 Conversations

### FR-1: Create Direct Conversation
- **Actor:** Authenticated user
- **Action:** Start a 1-to-1 conversation with another user by their userId
- **Behavior:**
  1. Sort the two userIds lexicographically: `[userA, userB] = [currentUser, targetUser].sort()`
  2. Attempt `upsert` on `conversations` where `directUserA = userA AND directUserB = userB`
  3. If conversation already exists: return it (HTTP `200`)
  4. If new: create with `type = DIRECT`, add both users as `MEMBER` (HTTP `201`)
- **Preconditions:**
  - Target user exists and `isActive = true`
  - Target user is not the current user
- **No friendship requirement.** Any authenticated user can message any other active user. The platform encourages open communication among learners.
- **Race condition handling:** `@@unique([directUserA, directUserB])` DB constraint prevents duplicates even under concurrent requests. Both callers receive the same conversation.

### FR-2: Create Group Conversation
- **Actor:** Authenticated user
- **Action:** Create a group conversation with a name and initial members
- **Behavior:**
  1. Create conversation with `type = GROUP`, `name = provided name`, `createdBy = currentUser`
  2. Add current user as `ConversationMember` with `role = ADMIN`
  3. Add each provided member as `ConversationMember` with `role = MEMBER`
- **Preconditions:**
  - `name` is 2-100 characters
  - `memberIds` contains at least 1 userId (+ creator = minimum 2 total)
  - All memberIds reference existing, active users

### FR-3: List Conversations
- **Actor:** Authenticated user
- **Action:** View all conversations the user is a member of
- **Response includes per conversation:**
  - Metadata: id, type, name, avatarUrl, updatedAt
  - `unreadCount`: `conversation.lastMessageSeq - member.lastReadSeq` (integer subtraction, no extra query)
  - `lastMessage`: most recent message (content, senderName, createdAt). Fetched via join where `seqNumber = conversation.lastMessageSeq`
  - `members`: For DIRECT — the other user only (exclude self). For GROUP — all members.
- **Ordering:** `updatedAt DESC` (most recently active first)
- **Pagination:** Offset-based (`page`, `limit`, default 20)

### FR-4: Get Conversation Detail
- **Actor:** Authenticated user who is a member
- **Action:** View full conversation info including all members with roles
- **Authorization:** `403 NOT_MEMBER` if user is not in `conversation_members`

### FR-5: Update Group
- **Actor:** User with `role = ADMIN` in the group
- **Action:** Update `name` and/or `avatarUrl`
- **Validation:** `name` must be 2-100 characters. `type` must be `GROUP`.

### FR-6: Add Members to Group
- **Actor:** User with `role = ADMIN`
- **Action:** Add one or more users
- **Behavior:** Create `ConversationMember` rows with `role = MEMBER`. Insert `SYSTEM` message: `"{adminName} added {memberName}"`. Skip already-existing members (idempotent via `skipDuplicates`).
- **Side effect:** Gateway emits `conversation_added` to new members' sockets so they can join the room.

### FR-7: Remove Member / Leave Group
- **Self-leave:** Any member can leave. Delete their row. Insert `SYSTEM` message: `"{name} left the group"`.
- **Remove other:** ADMIN only. Delete target's row. Insert `SYSTEM` message: `"{admin} removed {name}"`.
- **Last member leaves:** Delete conversation + all messages (cascade).
- **ADMIN leaves:** Longest-tenured remaining member auto-promoted to ADMIN.
- **DIRECT conversations:** Return `400 NOT_GROUP`.

## 2.2 Messages

### FR-8: Send Message
- **Actor:** Authenticated member of the conversation
- **Channel:** WebSocket event `send_message`
- **Step-by-step:**
  1. Gateway receives `{ conversationId, content, type, clientId }`
  2. **Rate limit:** Check `rateLimitMap[userId]`. Filter to last 5 seconds. If `>= 10`, return `{ success: false, error: 'RATE_LIMITED' }`.
  3. **Membership:** Query `conversation_members(conversationId, userId)`. If not found: `{ success: false, error: 'NOT_MEMBER' }`.
  4. **Validation:** `content` non-empty, max 5000 chars. `clientId` non-empty string.
  5. **Persist (Prisma transaction):**
     ```sql
     UPDATE conversations SET lastMessageSeq = lastMessageSeq + 1, updatedAt = NOW()
       WHERE id = :conversationId RETURNING lastMessageSeq;
     INSERT INTO messages (id, conversationId, senderId, type, content, clientId, seqNumber)
       VALUES (cuid(), :conversationId, :senderId, :type, :content, :clientId, :lastMessageSeq);
     ```
  6. **Idempotency:** If INSERT fails on `UNIQUE(conversationId, clientId)`, query and return the existing message. Transaction rolls back — `lastMessageSeq` is NOT double-incremented.
  7. **Broadcast:** `socket.to('conversation:' + conversationId).emit('new_message', message)` — excludes sender.
  8. **Ack sender:** Callback with `{ success: true, message: savedMessage }` including server-assigned `id`, `seqNumber`, `createdAt`.

### FR-9: Fetch Messages (Pagination)
- **Channel:** REST `GET /api/chat/conversations/:id/messages`
- **Pagination:** Cursor-based using message `id`
  - First request: omit `before` -> returns latest `limit` messages
  - Subsequent: `before = oldestLoadedMessageId` -> older messages
- **Query:** `WHERE conversationId = :id AND id < :before ORDER BY id DESC LIMIT :limit`
- **Index:** `@@index([conversationId, id])`
- **Response:** `{ data: Message[], hasMore: boolean }`
- **`hasMore`:** `true` if query returned `limit` rows

### FR-10: Mark Read
- **Channels:** REST `PATCH .../read` and WebSocket `mark_read`
- **Behavior:** Update `conversation_members.lastReadSeq = seqNumber`
- **Validation:**
  - `seqNumber <= conversation.lastMessageSeq` (no future reads)
  - `seqNumber >= member.lastReadSeq` (no backwards)
  - Invalid values silently ignored (prevents client bugs from corrupting state)
- **Broadcast:** `message_read { conversationId, userId, lastReadSeq }` to room

## 2.3 Typing Indicators

### FR-11: Typing Start/Stop
- **Channel:** WebSocket only. Zero DB writes.
- **`typing_start` flow:**
  1. Client emits `{ conversationId }`
  2. Server clears existing timeout for `${conversationId}:${userId}` if any
  3. Sets new 5-second timeout that auto-fires `user_stop_typing`
  4. Broadcasts `user_typing { conversationId, userId, displayName }` to room (excluding sender)
- **`typing_stop` flow:** Clear timeout, broadcast `user_stop_typing`
- **Disconnect cleanup:** Clear all timeouts for the user, broadcast `user_stop_typing` for each active conversation
- **Client-side debounce:** Emit `typing_start` on input change (300ms debounce). Emit `typing_stop` after 3s of inactivity or on send. Client safety: auto-clear after 6s of no re-emission.

## 2.4 Online Presence

### FR-12: Online/Offline Tracking
- **Data structure:** In-memory `Map<string, Set<string>>` — `userId -> Set<socketId>`
- **Connect:** Add socketId. If set went `0 -> 1`: broadcast `user_online { userId }`
- **Disconnect:** Remove socketId. If set now empty: broadcast `user_offline { userId, lastSeen }`
- **Multi-tab:** User with 3 tabs = 3 socketIds. Only goes "offline" when all close.
- **Limitation:** In-memory, lost on server restart. All users appear offline until reconnect. Acceptable for single server.

---

# 3. System Design

## 3.1 Architecture

```
                    ┌──────────────────────────────────────────┐
                    │          NestJS Application (port 4000)   │
                    │                                          │
 Browser ──REST──>  │  [ChatController]        ──> [ChatService]│──> PostgreSQL
                    │  [UsersController]       ──> [UserService]│
                    │                                          │
 Browser ──WS────>  │  [ChatGateway]           ──> [ChatService]│
                    │    ├─ presenceMap   (Map<userId, Set<socketId>>)
                    │    ├─ typingTimeouts (Map<key, Timeout>)  │
                    │    └─ rateLimitMap   (Map<userId, number[]>)
                    └──────────────────────────────────────────┘
```

- Single NestJS process, REST + WebSocket on same port
- `@WebSocketGateway` uses the same HTTP server automatically
- All business logic in `ChatService`. Gateway and controller are thin wrappers.
- Three in-memory maps in the gateway (presence, typing, rate limits)
- No Redis, no message broker, no microservices

## 3.2 Module Structure

```
AppModule
  ├── PrismaModule (global)
  ├── AuthModule (JwtModule, JwtStrategy, UsersModule)
  ├── UsersModule
  └── ChatModule (imports JwtModule for gateway auth)
        ├── ChatController (REST endpoints)
        ├── ChatService (all DB operations)
        └── ChatGateway (WebSocket handlers)
```

## 3.3 File Structure

### Backend
```
apps/api/src/chat/
  chat.module.ts
  chat.controller.ts
  chat.service.ts
  chat.gateway.ts
  dto/
    create-conversation.dto.ts     # { type, memberId?, memberIds?, name? }
    query-messages.dto.ts          # { limit?, before? }
    send-message.dto.ts            # { conversationId, content, type?, clientId }
    update-group.dto.ts            # { name?, avatarUrl? }
    add-members.dto.ts             # { userIds: string[] }
    mark-read.dto.ts               # { seqNumber: number }
```

### Frontend
```
apps/web/src/
  lib/
    socket.ts                      # Socket.io singleton (connect, disconnect, getSocket)
    chat-store.ts                  # Zustand: activeConversation, typing, online, sidebar toggle

  features/chat/hooks/
    use-chat.ts                    # useConversations, useMessages, useCreateConversation, useMarkRead
    use-socket-events.ts           # Socket event listener hook

  components/chat/
    chat-layout.tsx                # Sidebar + message area split
    conversation-list.tsx          # Search + conversation items
    conversation-item.tsx          # Avatar, name, last msg, unread, time
    message-area.tsx               # Header + scroll area + input
    message-bubble.tsx             # Left/right aligned bubble
    message-input.tsx              # Textarea + send button
    typing-indicator.tsx           # Animated dots
    create-group-modal.tsx         # Dialog: name + member selection
    group-info-drawer.tsx          # Sheet: members, roles, leave
    date-separator.tsx             # Day divider
    new-messages-pill.tsx          # Floating "New messages" button

  app/(learner)/
    chat/page.tsx                  # Chat page
```

---

# 4. Data Model

## 4.1 Enums

```prisma
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
```

## 4.2 Models

### Conversation
```prisma
model Conversation {
  id             String           @id @default(cuid())
  type           ConversationType @default(DIRECT)
  name           String?                          // null for DIRECT, required for GROUP
  avatarUrl      String?
  createdBy      String?                          // userId of creator (GROUP only)
  lastMessageSeq Int              @default(0)     // seq of latest message
  directUserA    String?                          // sorted lower userId (null for GROUP)
  directUserB    String?                          // sorted higher userId (null for GROUP)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  members  ConversationMember[]
  messages Message[]

  @@unique([directUserA, directUserB])            // prevents duplicate DIRECT conversations
  @@index([updatedAt])                            // conversation list ordering
  @@map("conversations")
}
```

### ConversationMember
```prisma
model ConversationMember {
  id             String     @id @default(cuid())
  conversationId String
  userId         String
  role           MemberRole @default(MEMBER)
  lastReadSeq    Int        @default(0)           // seq of last message user has read
  joinedAt       DateTime   @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])              // one membership per user per conversation
  @@index([userId])                               // "all conversations for a user"
  @@map("conversation_members")
}
```

### Message
```prisma
model Message {
  id             String      @id @default(cuid())
  conversationId String
  senderId       String
  type           MessageType @default(TEXT)
  content        String
  clientId       String?                          // client UUID for idempotency
  seqNumber      Int                              // sequential within conversation
  createdAt      DateTime    @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@unique([conversationId, clientId])            // idempotent message insertion
  @@unique([conversationId, seqNumber])           // unique sequential ordering
  @@index([conversationId, id])                   // cursor-based pagination
  @@map("messages")
}
```

### User Model Additions
```prisma
// Add to existing User model:
conversationMembers    ConversationMember[]
messages               Message[]
```

## 4.3 Indexing Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| conversations | `(directUserA, directUserB)` | UNIQUE | DIRECT dedup, race-safe upsert |
| conversations | `(updatedAt)` | INDEX | Conversation list ordering |
| conversation_members | `(conversationId, userId)` | UNIQUE | One membership per user, O(1) membership check |
| conversation_members | `(userId)` | INDEX | "All conversations for user" query |
| messages | `(conversationId, clientId)` | UNIQUE | Idempotent message insertion |
| messages | `(conversationId, seqNumber)` | UNIQUE | Guarantee sequential ordering |
| messages | `(conversationId, id)` | INDEX | Cursor-based pagination |

## 4.4 Unread Calculation

```
unreadCount = conversation.lastMessageSeq - conversationMember.lastReadSeq
```

- Pure integer subtraction. Computed inline in the conversation list query.
- No COUNT query. No subquery. No per-message read table.
- `lastMessageSeq` is incremented atomically in the message creation transaction.
- `lastReadSeq` is updated when the user calls `mark_read`.

---

# 5. API Design

## 5.1 REST Endpoints

All endpoints require `Authorization: Bearer <accessToken>` (JwtAuthGuard).

### POST /api/chat/conversations

Create a new conversation.

**Request (DIRECT):**
```json
{ "type": "DIRECT", "memberId": "cuid_of_other_user" }
```

**Request (GROUP):**
```json
{ "type": "GROUP", "name": "Study Group", "memberIds": ["cuid1", "cuid2"] }
```

**Response `201 Created` (new) or `200 OK` (existing DIRECT):**
```json
{
  "id": "conv_cuid",
  "type": "DIRECT",
  "name": null,
  "lastMessageSeq": 0,
  "createdAt": "2026-03-26T10:00:00.000Z",
  "members": [
    {
      "id": "member_cuid",
      "userId": "user_cuid",
      "role": "MEMBER",
      "user": { "id": "user_cuid", "displayName": "John Doe", "avatarUrl": null }
    }
  ]
}
```

**Errors:**

| HTTP | Code | Condition |
|------|------|-----------|
| 400 | SELF_CONVERSATION | `memberId === currentUser` |
| 400 | INVALID_TYPE | type is not DIRECT or GROUP |
| 400 | MIN_MEMBERS | GROUP with < 1 memberId |
| 400 | NAME_REQUIRED | GROUP without name |
| 404 | USER_NOT_FOUND | memberId or any memberIds not found / inactive |

**DIRECT service logic:**
```typescript
const [userA, userB] = [currentUserId, dto.memberId].sort();
return this.prisma.conversation.upsert({
  where: { directUserA_directUserB: { directUserA: userA, directUserB: userB } },
  create: {
    type: 'DIRECT', directUserA: userA, directUserB: userB,
    members: { create: [{ userId: userA }, { userId: userB }] },
  },
  update: {},
  include: { members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } } },
});
```

---

### GET /api/chat/conversations

List user's conversations.

**Query:** `page` (default 1), `limit` (default 20, max 50)

**Response `200`:**
```json
{
  "data": [
    {
      "id": "conv_cuid",
      "type": "DIRECT",
      "name": null,
      "lastMessageSeq": 47,
      "updatedAt": "2026-03-26T12:00:00.000Z",
      "unreadCount": 3,
      "lastMessage": {
        "id": "msg_cuid",
        "content": "Hello!",
        "type": "TEXT",
        "senderId": "user_cuid",
        "senderName": "John",
        "createdAt": "2026-03-26T12:00:00.000Z"
      },
      "members": [
        { "userId": "user_cuid", "displayName": "John Doe", "avatarUrl": null }
      ]
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 20
}
```

**Notes:**
- `unreadCount = lastMessageSeq - currentMember.lastReadSeq` (computed in app layer)
- DIRECT: `members` excludes self (shows the other person)
- GROUP: `members` shows all
- `lastMessage` is null if conversation has no messages

---

### GET /api/chat/conversations/:id

Get conversation detail with all members and roles.

**Response `200`:**
```json
{
  "id": "conv_cuid",
  "type": "GROUP",
  "name": "Study Group",
  "createdBy": "user_cuid",
  "lastMessageSeq": 120,
  "createdAt": "2026-03-20T10:00:00.000Z",
  "members": [
    {
      "id": "member_cuid",
      "userId": "user_cuid",
      "role": "ADMIN",
      "lastReadSeq": 118,
      "joinedAt": "2026-03-20T10:00:00.000Z",
      "user": { "id": "user_cuid", "displayName": "Alice", "avatarUrl": null }
    }
  ]
}
```

**Errors:** `403 NOT_MEMBER`, `404 NOT_FOUND`

---

### GET /api/chat/conversations/:id/messages

Fetch messages with cursor-based pagination.

**Query:** `limit` (default 30, max 50), `before` (optional message id cursor)

**Response `200`:**
```json
{
  "data": [
    {
      "id": "msg_cuid",
      "conversationId": "conv_cuid",
      "senderId": "user_cuid",
      "type": "TEXT",
      "content": "Hello!",
      "seqNumber": 120,
      "createdAt": "2026-03-26T12:00:00.000Z",
      "sender": { "id": "user_cuid", "displayName": "John Doe", "avatarUrl": null }
    }
  ],
  "hasMore": true
}
```

**Query logic:**
```typescript
const where: any = { conversationId: id };
if (before) where.id = { lt: before };
const messages = await prisma.message.findMany({
  where,
  orderBy: { id: 'desc' },
  take: limit + 1,
  include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
});
const hasMore = messages.length > limit;
if (hasMore) messages.pop();
return { data: messages, hasMore };
```

**Errors:** `403 NOT_MEMBER`, `404 NOT_FOUND`

---

### PATCH /api/chat/conversations/:id

Update group name/avatar. ADMIN only.

**Request:**
```json
{ "name": "New Name", "avatarUrl": "https://..." }
```

**Errors:** `400 NOT_GROUP`, `403 NOT_ADMIN`

---

### POST /api/chat/conversations/:id/members

Add members to group. ADMIN only.

**Request:**
```json
{ "userIds": ["user_cuid1", "user_cuid2"] }
```

**Response `201`:**
```json
{ "added": [{ "userId": "user_cuid1", "displayName": "Jane" }] }
```

**Errors:** `400 NOT_GROUP`, `403 NOT_ADMIN`, `404 USER_NOT_FOUND`

---

### DELETE /api/chat/conversations/:id/members/:userId

Remove member or leave group.

- `:userId === currentUser` -> leave (any role)
- `:userId !== currentUser` -> remove (ADMIN only)

**Response `200`:** `{ "message": "Member removed" }`

**Errors:** `400 NOT_GROUP`, `403 NOT_ADMIN`

---

### PATCH /api/chat/conversations/:id/read

Mark conversation as read.

**Request:**
```json
{ "seqNumber": 47 }
```

**Response `200`:** `{ "lastReadSeq": 47 }`

**Logic:**
```typescript
await prisma.conversationMember.update({
  where: { conversationId_userId: { conversationId: id, userId: currentUserId } },
  data: { lastReadSeq: Math.min(seqNumber, conversation.lastMessageSeq) },
});
```

---

## 5.2 WebSocket Events

### Connection

**URL:** `ws://localhost:4000/chat` (Socket.io namespace `/chat`)

**Authentication:**
```javascript
const socket = io('http://localhost:4000/chat', {
  auth: { token: '<accessToken>' },
  transports: ['websocket', 'polling'],
});
```

**Server `handleConnection(socket)`:**
1. Extract `socket.handshake.auth.token`
2. `jwtService.verify(token)` — on failure: emit `auth_error`, disconnect
3. Store `socket.data.user = { id, email, role }`
4. Add to presence map
5. Client must explicitly join rooms (no auto-join)

**Server `handleDisconnect(socket)`:**
1. Remove from presence map
2. If last socket for user: clear typing timeouts, broadcast `user_offline`

---

### Client -> Server Events

#### `send_message`

**Payload:**
```json
{
  "conversationId": "conv_cuid",
  "content": "Hello!",
  "type": "TEXT",
  "clientId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| conversationId | string | yes | Target conversation |
| content | string | yes | Message text (1-5000 chars) |
| type | MessageType | no | Default: TEXT |
| clientId | string | yes | Client-generated UUID v4 for idempotency |

**Ack callback (success):**
```json
{
  "success": true,
  "message": {
    "id": "msg_cuid",
    "conversationId": "conv_cuid",
    "senderId": "user_cuid",
    "content": "Hello!",
    "type": "TEXT",
    "seqNumber": 48,
    "createdAt": "2026-03-26T12:00:00.000Z",
    "sender": { "id": "user_cuid", "displayName": "John", "avatarUrl": null }
  }
}
```

**Ack callback (error):**
```json
{ "success": false, "error": "NOT_MEMBER" | "RATE_LIMITED" | "VALIDATION_ERROR" }
```

---

#### `join_conversation`

**Payload:** `{ "conversationId": "conv_cuid" }`

Server validates membership, then `socket.join('conversation:conv_cuid')`.

**Ack:** `{ "success": true }` or `{ "success": false, "error": "NOT_MEMBER" }`

---

#### `leave_conversation`

**Payload:** `{ "conversationId": "conv_cuid" }`

`socket.leave('conversation:conv_cuid')`. Socket.io room only — does NOT remove from DB.

---

#### `mark_read`

**Payload:** `{ "conversationId": "conv_cuid", "seqNumber": 47 }`

Updates `lastReadSeq` in DB, broadcasts `message_read` to room.

---

#### `typing_start`

**Payload:** `{ "conversationId": "conv_cuid" }`

Sets/resets 5s timeout, broadcasts `user_typing` to room (excluding sender).

---

#### `typing_stop`

**Payload:** `{ "conversationId": "conv_cuid" }`

Clears timeout, broadcasts `user_stop_typing` to room (excluding sender).

---

### Server -> Client Events

#### `new_message`

Emitted when a message is saved to DB. **Sent to room excluding sender** (sender gets the message via ack callback).

```json
{
  "id": "msg_cuid",
  "conversationId": "conv_cuid",
  "senderId": "user_cuid",
  "content": "Hello!",
  "type": "TEXT",
  "seqNumber": 48,
  "createdAt": "2026-03-26T12:00:00.000Z",
  "sender": { "id": "user_cuid", "displayName": "John Doe", "avatarUrl": null }
}
```

#### `message_read`

```json
{ "conversationId": "conv_cuid", "userId": "user_cuid", "lastReadSeq": 47 }
```

#### `user_typing`

```json
{ "conversationId": "conv_cuid", "userId": "user_cuid", "displayName": "John Doe" }
```

#### `user_stop_typing`

```json
{ "conversationId": "conv_cuid", "userId": "user_cuid" }
```

#### `user_online`

```json
{ "userId": "user_cuid" }
```

#### `user_offline`

```json
{ "userId": "user_cuid", "lastSeen": "2026-03-26T12:00:00.000Z" }
```

#### `auth_error`

```json
{ "message": "Token expired" }
```

Client action: disconnect, refresh token via `/auth/refresh`, reconnect with new token.

#### `conversation_added`

Emitted to a user's socket when they are added to a group by an admin.

```json
{ "conversationId": "conv_cuid", "name": "Study Group" }
```

Client action: call `join_conversation` and invalidate conversations query.

---

### Room Strategy

| Room Format | Example | Purpose |
|-------------|---------|---------|
| `conversation:{id}` | `conversation:clx1234abcd` | Message delivery, typing, read receipts |

- Rooms joined explicitly via `join_conversation` event
- Left via `leave_conversation` or auto-cleaned on disconnect
- No auto-join on connect — client controls which rooms to listen to

---

# 6. Core Business Logic

## 6.1 Message Creation Transaction

```typescript
async createMessage(
  conversationId: string, senderId: string,
  content: string, type: MessageType, clientId: string,
): Promise<Message> {
  try {
    return await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageSeq: { increment: 1 }, updatedAt: new Date() },
      });

      return tx.message.create({
        data: {
          conversationId, senderId, type, content, clientId,
          seqNumber: conv.lastMessageSeq,
        },
        include: {
          sender: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
    });
  } catch (error) {
    // Prisma P2002 = unique constraint violation
    if (error.code === 'P2002' && error.meta?.target?.includes('clientId')) {
      // Idempotent: return the already-existing message
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

**Key guarantees:**
- `lastMessageSeq` incremented atomically inside the transaction
- If `clientId` already exists, transaction rolls back, `lastMessageSeq` unchanged
- `seqNumber` always matches the conversation's `lastMessageSeq` at insertion time

## 6.2 Direct Conversation Dedup

```typescript
async getOrCreateDirect(currentUserId: string, targetUserId: string) {
  if (currentUserId === targetUserId) throw new BadRequestException('SELF_CONVERSATION');

  const target = await this.prisma.user.findUnique({
    where: { id: targetUserId, isActive: true },
  });
  if (!target) throw new NotFoundException('USER_NOT_FOUND');

  const [userA, userB] = [currentUserId, targetUserId].sort();

  return this.prisma.conversation.upsert({
    where: { directUserA_directUserB: { directUserA: userA, directUserB: userB } },
    create: {
      type: 'DIRECT', directUserA: userA, directUserB: userB,
      members: { create: [{ userId: userA }, { userId: userB }] },
    },
    update: {},
    include: { members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } } },
  });
}
```

## 6.3 Membership Check

```typescript
async assertMember(conversationId: string, userId: string): Promise<ConversationMember> {
  const member = await this.prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw new ForbiddenException('NOT_MEMBER');
  return member;
}

async assertAdmin(conversationId: string, userId: string): Promise<ConversationMember> {
  const member = await this.assertMember(conversationId, userId);
  if (member.role !== 'ADMIN') throw new ForbiddenException('NOT_ADMIN');
  return member;
}
```

## 6.4 Gateway Message Flow

```typescript
@SubscribeMessage('send_message')
async handleSendMessage(
  @ConnectedSocket() socket: Socket,
  @MessageBody() dto: { conversationId: string; content: string; type?: MessageType; clientId: string },
): Promise<{ success: boolean; message?: Message; error?: string }> {
  const userId = socket.data.user.id;

  // 1. Rate limit
  if (this.isRateLimited(userId)) return { success: false, error: 'RATE_LIMITED' };

  // 2. Validate membership
  const member = await this.chatService.findMember(dto.conversationId, userId);
  if (!member) return { success: false, error: 'NOT_MEMBER' };

  // 3. Validate payload
  if (!dto.content?.trim() || dto.content.length > 5000 || !dto.clientId) {
    return { success: false, error: 'VALIDATION_ERROR' };
  }

  // 4. Save to DB
  const message = await this.chatService.createMessage(
    dto.conversationId, userId, dto.content.trim(), dto.type ?? 'TEXT', dto.clientId,
  );

  // 5. Broadcast to room (excludes sender)
  socket.to(`conversation:${dto.conversationId}`).emit('new_message', message);

  // 6. Ack to sender
  return { success: true, message };
}
```

## 6.5 Presence Map

```typescript
private presenceMap = new Map<string, Set<string>>();  // userId -> Set<socketId>

handleConnection(socket: Socket) {
  const userId = socket.data.user.id;
  if (!this.presenceMap.has(userId)) this.presenceMap.set(userId, new Set());
  const wasOffline = this.presenceMap.get(userId).size === 0;
  this.presenceMap.get(userId).add(socket.id);
  if (wasOffline) this.broadcastPresence(userId, 'user_online');
}

handleDisconnect(socket: Socket) {
  const userId = socket.data.user?.id;
  if (!userId) return;
  this.presenceMap.get(userId)?.delete(socket.id);
  if (this.presenceMap.get(userId)?.size === 0) {
    this.presenceMap.delete(userId);
    this.clearTypingTimeouts(userId);
    this.broadcastPresence(userId, 'user_offline', { lastSeen: new Date().toISOString() });
  }
}

isOnline(userId: string): boolean {
  return (this.presenceMap.get(userId)?.size ?? 0) > 0;
}
```

## 6.6 Typing Timeout Map

```typescript
private typingTimeouts = new Map<string, NodeJS.Timeout>();  // "convId:userId" -> timeout

handleTypingStart(socket: Socket, conversationId: string) {
  const userId = socket.data.user.id;
  const key = `${conversationId}:${userId}`;
  const room = `conversation:${conversationId}`;

  // Clear existing timeout
  if (this.typingTimeouts.has(key)) clearTimeout(this.typingTimeouts.get(key));

  // Set 5-second auto-stop
  this.typingTimeouts.set(key, setTimeout(() => {
    this.typingTimeouts.delete(key);
    socket.to(room).emit('user_stop_typing', { conversationId, userId });
  }, 5000));

  // Broadcast
  const displayName = socket.data.user.displayName;
  socket.to(room).emit('user_typing', { conversationId, userId, displayName });
}

handleTypingStop(socket: Socket, conversationId: string) {
  const userId = socket.data.user.id;
  const key = `${conversationId}:${userId}`;
  if (this.typingTimeouts.has(key)) {
    clearTimeout(this.typingTimeouts.get(key));
    this.typingTimeouts.delete(key);
  }
  socket.to(`conversation:${conversationId}`).emit('user_stop_typing', { conversationId, userId });
}

clearTypingTimeouts(userId: string) {
  for (const [key, timeout] of this.typingTimeouts) {
    if (key.endsWith(`:${userId}`)) {
      clearTimeout(timeout);
      const conversationId = key.split(':')[0];
      this.server.to(`conversation:${conversationId}`).emit('user_stop_typing', { conversationId, userId });
      this.typingTimeouts.delete(key);
    }
  }
}
```

## 6.7 Rate Limiter

```typescript
private rateLimitMap = new Map<string, number[]>();  // userId -> timestamps

isRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 5000; // 5 seconds
  const maxMessages = 10;

  let timestamps = this.rateLimitMap.get(userId) ?? [];
  timestamps = timestamps.filter(t => now - t < window);
  this.rateLimitMap.set(userId, timestamps);

  if (timestamps.length >= maxMessages) return true;
  timestamps.push(now);
  return false;
}
```

---

# 7. Edge Cases

## 7.1 Network & Connection

| Scenario | Behavior |
|----------|----------|
| Client disconnects mid-message | Transaction ensures atomicity. Message is fully saved or not at all. Client retries with same `clientId` — idempotent. |
| Client reconnects after disconnect | Socket.io auto-reconnects. JWT re-verified. Client fetches conversation list via REST, re-joins rooms. Messages during downtime are fetched via cursor pagination. |
| Server restarts | All connections drop. In-memory state (presence, typing, rate limits) lost. Clients reconnect. All users temporarily offline. Messages in DB preserved. |
| JWT expires during session | WebSocket stays connected (JWT only checked on connect). On reconnect, expired token rejected. Client receives `auth_error`, refreshes token, reconnects. |
| Multiple tabs | Same user has multiple sockets. All in presence map. Each tab joins rooms independently. User stays "online" until all tabs close. |

## 7.2 Duplicate & Race Conditions

| Scenario | Behavior |
|----------|----------|
| Same `clientId` sent twice | `UNIQUE(conversationId, clientId)` catches the duplicate. Transaction rolls back. Existing message returned. `lastMessageSeq` not double-incremented. |
| Concurrent DIRECT conversation creation | `UNIQUE(directUserA, directUserB)` + `upsert` pattern. Both requests return same conversation. |
| Mark read with stale seqNumber | `seqNumber >= lastReadSeq` check. Stale but valid values accepted (idempotent). |
| User sends to conversation they were just removed from | Membership check fails: `NOT_MEMBER` error. |
| Two admins remove each other simultaneously | First `DELETE` succeeds. Second finds member gone, returns `404`. |
| Admin leaves, no other admin | Longest-tenured member auto-promoted to ADMIN before the leave completes. |

## 7.3 Invalid Data

| Scenario | Behavior |
|----------|----------|
| Empty message content | Validation: `VALIDATION_ERROR` |
| Content > 5000 chars | Validation: `VALIDATION_ERROR` |
| Non-existent conversationId | Membership query returns null: `NOT_MEMBER` |
| Invalid userId in add members | `prisma.user.findMany` returns fewer results. Return `404 USER_NOT_FOUND` for missing IDs. |
| `seqNumber` > `lastMessageSeq` | Clamped to `lastMessageSeq` (no future reads) |
| `seqNumber` < current `lastReadSeq` | Ignored (no backwards) |

---

# 8. Performance

## 8.1 Database

| Operation | Optimization |
|-----------|-------------|
| Conversation list + unread | `unreadCount = lastMessageSeq - lastReadSeq`. Computed in app layer. Single query with JOIN. No subquery, no COUNT. |
| Message pagination | Cursor-based `WHERE id < cursor ORDER BY id DESC`. Uses `@@index([conversationId, id])`. Constant time regardless of total messages. |
| Membership check | `@@unique([conversationId, userId])` = index-backed O(1) lookup |
| DIRECT dedup | `@@unique([directUserA, directUserB])` = index-backed upsert |
| Message insert | Transaction: 1 UPDATE + 1 INSERT. Idempotency via unique constraint, no retry loop. |

## 8.2 WebSocket

| Optimization | Detail |
|-------------|--------|
| Sender exclusion | `socket.to(room)` not `server.to(room)`. Sender does not receive their own message over the wire. |
| Explicit room joins | Client joins only rooms it is actively viewing. Reduces event traffic. |
| No DB writes for typing | Purely in-memory. Zero database load. |
| 5s typing TTL | Prevents memory leaks from abandoned typing states. Timeouts cleared on disconnect. |

## 8.3 Frontend

| Optimization | Detail |
|-------------|--------|
| Optimistic sends | Message appears in UI immediately. Replaced with confirmed version on ack. |
| React Query cache | `new_message` appended directly to `['messages', convId]` cache. No refetch. |
| Conversation list | Invalidated only on `new_message` and `message_read`. Not on every event. |
| Infinite scroll | Messages loaded in pages of 30. Older loaded on scroll-to-top. |
| Client-side filter | Sidebar search filters loaded conversations locally. No server round-trip. |

## 8.4 Write Path Summary

```
1 message = 1 Prisma transaction (2 SQL statements)
  - UPDATE conversations (increment seq, update timestamp)
  - INSERT messages (with seqNumber and clientId)
No per-user records. No delivery table. No read-receipt table.
Broadcast via Socket.io room to all connected members.
```

---

# 9. Security

## 9.1 Authentication

| Layer | Mechanism |
|-------|-----------|
| REST | `Authorization: Bearer <token>`. `JwtAuthGuard` (Passport). `@CurrentUser()` decorator extracts user. |
| WebSocket | `socket.handshake.auth.token`. Verified in `handleConnection` via `jwtService.verify()`. |
| Token refresh | REST: 401 interceptor calls `/auth/refresh`. WebSocket: `auth_error` event triggers disconnect -> refresh -> reconnect. |
| Expiry | Access: 15min. Refresh: 7 days. WebSocket not proactively disconnected on access token expiry (was valid at connect). |

## 9.2 Authorization

| Action | Rule |
|--------|------|
| Create DIRECT conversation | Any authenticated user with any other active user |
| Create GROUP | Any authenticated user |
| Read messages | Must be `ConversationMember` |
| Send message | Must be `ConversationMember` |
| Update group | `role = ADMIN` |
| Add members | `role = ADMIN` |
| Remove other member | `role = ADMIN` |
| Leave group | Any `ConversationMember` |
| Join Socket.io room | `ConversationMember` check on `join_conversation` |

## 9.3 Rate Limiting

| Target | Limit | Window | Storage |
|--------|-------|--------|---------|
| `send_message` (WS) | 10 messages | 5 seconds | In-memory `Map<userId, number[]>` |

Implementation: On each `send_message`, filter timestamp array to last 5s. If length >= 10, reject. Otherwise push `Date.now()`.

## 9.4 Input Validation

| Layer | Mechanism |
|-------|-----------|
| REST DTOs | `class-validator`: `@IsString()`, `@IsNotEmpty()`, `@IsEnum()`, `@MaxLength()`, `@MinLength()`, `@IsOptional()` |
| WebSocket payloads | Manual validation in gateway before calling service: check required fields, types, lengths |
| SQL injection | Prisma parameterizes all queries. No raw SQL anywhere. |
| XSS | Content stored as-is. React auto-escapes JSX on render. No `dangerouslySetInnerHTML` for messages. |
| Sender spoofing | `senderId` always set from `socket.data.user.id` (JWT). Never from client payload. |

## 9.5 Abuse Prevention

| Threat | Mitigation |
|--------|-----------|
| Message spam | Rate limiter: 10 msgs / 5 sec |
| Unauthorized room join | `join_conversation` validates DB membership before `socket.join()` |
| Eavesdropping | All REST endpoints + WS events check membership. Cannot fetch messages from conversations you're not in. |
| Forged identity | senderId from JWT, not from request body |

---

# 10. Error Codes

## REST

| HTTP | Code | Description |
|------|------|-------------|
| 400 | SELF_CONVERSATION | Cannot create DIRECT with yourself |
| 400 | INVALID_TYPE | Type must be DIRECT or GROUP |
| 400 | MIN_MEMBERS | GROUP requires at least 1 memberId |
| 400 | NAME_REQUIRED | GROUP requires a name |
| 400 | NOT_GROUP | Operation only valid for GROUP |
| 403 | NOT_MEMBER | User is not a conversation member |
| 403 | NOT_ADMIN | Only admins can perform this action |
| 404 | NOT_FOUND | Resource not found |
| 404 | USER_NOT_FOUND | User does not exist or inactive |

## WebSocket (ack callback)

| Code | Description |
|------|-------------|
| NOT_MEMBER | User not in conversation |
| RATE_LIMITED | Exceeded 10 msgs / 5 sec |
| VALIDATION_ERROR | Invalid payload (empty content, missing clientId, etc.) |

## WebSocket (server-emitted)

| Event | When |
|-------|------|
| `auth_error` | JWT invalid or expired on connect |

---

# 11. Dependencies

## New Packages

**Backend (`apps/api`):**
```
@nestjs/websockets           # WebSocket abstraction
@nestjs/platform-socket.io   # Socket.io adapter
```

**Frontend (`apps/web`):**
```
socket.io-client             # Socket.io client
```

## Existing Packages Used

| Package | Usage |
|---------|-------|
| `@nestjs/jwt` | JWT verification in gateway `handleConnection` |
| `@prisma/client` | All database operations |
| `class-validator` | DTO validation |
| `@tanstack/react-query` | Conversations, messages (server state) |
| `zustand` | Typing, online, active conversation (UI state) |
| `socket.io-client` | WebSocket connection |
| `sonner` | Toast notifications |
| `lucide-react` | Chat icons (MessageSquare, SendHorizonal, etc.) |

---

# 12. Frontend State Management

## Zustand (`chat-store.ts`) — ephemeral UI state only

```typescript
interface ChatStore {
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;

  typingUsers: Record<string, { userId: string; displayName: string }[]>;
  setTyping: (convId: string, userId: string, name: string, isTyping: boolean) => void;

  onlineUsers: Set<string>;
  setUserOnline: (userId: string, online: boolean) => void;

  showSidebar: boolean;
  toggleSidebar: () => void;
}
```

## React Query — server-synced state

| Query Key | Endpoint | Type |
|-----------|----------|------|
| `['conversations']` | `GET /api/chat/conversations` | `useQuery` |
| `['messages', conversationId]` | `GET /api/chat/conversations/:id/messages` | `useInfiniteQuery` |
| `['conversation', id]` | `GET /api/chat/conversations/:id` | `useQuery` |

## Socket event -> state mapping

| Event | React Query | Zustand |
|-------|------------|---------|
| `new_message` | `setQueryData(['messages', convId], append)` + `invalidateQueries(['conversations'])` | - |
| `message_read` | `invalidateQueries(['conversations'])` | - |
| `user_typing` | - | `setTyping(convId, userId, name, true)` |
| `user_stop_typing` | - | `setTyping(convId, userId, name, false)` |
| `user_online` | - | `setUserOnline(userId, true)` |
| `user_offline` | - | `setUserOnline(userId, false)` |

---

# 13. Migration

```bash
# 1. Install backend packages
cd apps/api && npm install @nestjs/websockets @nestjs/platform-socket.io

# 2. Update prisma schema (add enums + 3 models + User relations)

# 3. Run migration
npx prisma migrate dev --name add_chat_system

# 4. Install frontend package
cd apps/web && npm install socket.io-client

# 5. Verify
npx prisma generate && npm run build
```

---

# 14. Scalability Path (Future)

Current: single server, in-memory maps, direct Socket.io.

To scale horizontally:

| Component | Current | Future |
|-----------|---------|--------|
| Socket.io | Single server | Add `@socket.io/redis-adapter` for multi-server |
| Presence map | In-memory `Map` | Redis hash `online:{userId}` |
| Typing timeouts | In-memory `Map` | Redis keys with TTL |
| Rate limiter | In-memory `Map` | Redis sliding window |
| DB connections | Prisma default pool (10) | Increase via `?connection_limit=N` |

No application logic changes required — only swap the storage backends.

---

# 15. UI/UX Specification

## 15.1 Routes & Navigation

### New Route

| Route | Page | Route Group | Layout |
|-------|------|-------------|--------|
| `/chat` | Chat Page | `(learner)` | Inherits Navbar + Footer |

### Navbar Update

Add a "Chat" link to the existing Navbar (`components/landing/navbar.tsx`):

| Item | Icon | Route | Badge |
|------|------|-------|-------|
| Chat | `MessageSquare` (lucide) | `/chat` | Red circle with total unread count. Hidden when 0. |

**Badge data:** Derived from conversations query: `sum(all unreadCounts)`. Fetched via `useQuery(['conversations'])` with `select: (data) => data.data.reduce((sum, c) => sum + c.unreadCount, 0)`.

**Placement:** Between "Dashboard" and "Pricing" in the `navLinks` array.

---

## 15.2 Chat Page — Overall Layout

**File:** `apps/web/src/app/(learner)/chat/page.tsx` — `'use client'`

```
+------------------------------------------------------------------+
|  Navbar (existing, with new Chat badge)                           |
+------------------------------------------------------------------+
|                                                                    |
|  +--- SIDEBAR (w-80) ---+  +--- MESSAGE AREA (flex-1) ---------+ |
|  |                       |  |                                    | |
|  | [Search input]        |  | [Conversation Header]              | |
|  | [+ New Group]         |  | +--------------------------------+ | |
|  |                       |  | |                                | | |
|  | +-------------------+ |  | |  Messages (scroll)             | | |
|  | | Conversation Item | |  | |                                | | |
|  | | Conversation Item | |  | |  [date separator]              | | |
|  | | (active) ████████ |<-->| |  [bubble]  [bubble]            | | |
|  | | Conversation Item | |  | |  [bubble]  [bubble]            | | |
|  | | Conversation Item | |  | |                                | | |
|  | +-------------------+ |  | |  [typing indicator]            | | |
|  |                       |  | +--------------------------------+ | |
|  |                       |  | [Message Input Bar]                | |
|  +-----------------------+  +------------------------------------+ |
|                                                                    |
+------------------------------------------------------------------+
|  Footer (existing)                                                |
+------------------------------------------------------------------+
```

### Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| Desktop `>= 768px` | Side-by-side. Sidebar (320px fixed) + message area (flex-1). Both visible. |
| Mobile `< 768px` | Full-screen toggle. Show sidebar OR message area, never both. Managed by `chatStore.showSidebar`. Back arrow in message header returns to sidebar. |

### Container Override

The learner layout applies `max-w-7xl mx-auto px-4 pt-28 pb-12`. The chat page needs edge-to-edge layout. Override with:
```tsx
<div className="-mx-4 sm:-mx-6 lg:-mx-8 -mb-12 h-[calc(100vh-7rem)]">
  <ChatLayout />
</div>
```
This negates the parent padding and fills the viewport below the navbar.

---

## 15.3 Conversation Sidebar

**Component:** `components/chat/conversation-list.tsx`

### Structure

```
+-----------------------------+
| [🔍] Search conversations.. |  <- Input, Search icon (lucide)
+-----------------------------+
| [+ New Group]               |  <- Button variant="outline", Users icon
+-----------------------------+
|                             |
| +-------------------------+ |
| | [Avatar][🟢] John Doe 2m| |  <- 40px avatar + 8px online dot + timeAgo
| | Hello, how are y...     | |  <- lastMessage.content, truncated 1 line
| |                     [3] | |  <- unread badge (only if > 0)
| +-------------------------+ |
|                             |
| +-------------------------+ |
| | [👥] Study Group    1h  | |  <- Users icon for groups (or stacked avatars)
| | Alice: Check th...      | |  <- GROUP: prefix with sender first name
| +-------------------------+ |
|                             |
+-----------------------------+
```

### Conversation Item Component

**File:** `components/chat/conversation-item.tsx`

**Props:** `conversation: ConversationListItem`, `isActive: boolean`, `onClick: () => void`

| Element | Spec |
|---------|------|
| **Avatar** | 40px. For DIRECT: other user's `avatarUrl` or initials fallback (first letter of displayName, `bg-primary/10 text-primary`). For GROUP: `Users` icon in a circle or `avatarUrl` if set. |
| **Online dot** | 8px circle, positioned bottom-right of avatar. `bg-green-500` if online (from `chatStore.onlineUsers`), `bg-gray-300` if offline. DIRECT only. |
| **Name** | `text-sm font-medium truncate`. DIRECT: other user's displayName. GROUP: conversation name. |
| **Time** | `text-xs text-muted-foreground` right-aligned. `timeAgo(lastMessage.createdAt)`. |
| **Last message** | `text-xs text-muted-foreground truncate`. For GROUP: `"{senderFirstName}: {content}"`. For DIRECT: `"{content}"`. If no messages: `"No messages yet"` italic. |
| **Unread badge** | `bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center`. Only rendered when `unreadCount > 0`. Shows number (cap at "99+"). |

**Visual states:**

| State | Classes |
|-------|---------|
| Default | `bg-white hover:bg-muted/50 cursor-pointer` |
| Active | `bg-primary/10 border-l-2 border-primary` |
| Has unread | Name and message use `font-semibold text-foreground` instead of muted |

### Search

- Client-side filter on loaded conversations
- Filters by: member displayName (DIRECT) or conversation name (GROUP)
- Debounced input: 300ms
- Shows "No conversations found" empty state when filter returns empty

### Data Source

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['conversations'],
  queryFn: () => api.get('/chat/conversations').then(r => r.data),
});
```

---

## 15.4 Conversation Header

**Location:** Top of `components/chat/message-area.tsx`

### DIRECT Conversation
```
+------------------------------------------------------------+
| [← back]  [Avatar][🟢] John Doe                            |
|                          Online / Last seen 2h ago          |
+------------------------------------------------------------+
```

### GROUP Conversation
```
+------------------------------------------------------------+
| [← back]  [👥] Study Group                          [ℹ️]  |
|                  5 members, 3 online                        |
+------------------------------------------------------------+
```

| Element | Spec |
|---------|------|
| **Back arrow** | Mobile only (`md:hidden`). `ArrowLeft` icon. Calls `chatStore.toggleSidebar()`. |
| **Avatar** | 36px. Same logic as conversation item. |
| **Online dot** | 10px. DIRECT only. Green/gray based on `chatStore.onlineUsers.has(userId)`. |
| **Name** | `text-base font-semibold`. |
| **Subtitle** | `text-xs text-muted-foreground`. DIRECT: `"Online"` or `"Last seen {timeAgo}"`. GROUP: `"{N} members, {M} online"` (M computed from onlineUsers intersection with member list). |
| **Info button** | GROUP only. `Info` icon (lucide). Opens `GroupInfoDrawer` (Sheet from right). |

**Border:** `border-b` separating header from messages.

---

## 15.5 Message Area

**Location:** Center scrollable section of `components/chat/message-area.tsx`

### Layout

- `flex flex-col` filling space between header and input
- `overflow-y-auto` with `flex-col-reverse` for natural bottom-anchoring
- Messages flow oldest (top) to newest (bottom)

### Date Separator

**Component:** `components/chat/date-separator.tsx`

```
            ─── March 26, 2026 ───
```

- Rendered between messages from different calendar days
- `text-[11px] text-muted-foreground` centered
- Horizontal lines: `border-t border-muted` on each side via flexbox + `flex-1`
- Today shows "Today", yesterday shows "Yesterday", else full date

### Message Bubble

**Component:** `components/chat/message-bubble.tsx`

**Props:** `message`, `isOwn: boolean`, `showAvatar: boolean`, `showSender: boolean`, `showTimestamp: boolean`, `readByOther: boolean`

**Other user (left-aligned):**
```
[Avatar]  ┌─────────────────────────┐
  32px    │ Hello, how are you?     │  bg-muted rounded-lg rounded-tl-sm
          └─────────────────────────┘
          10:30 AM
```

**Current user (right-aligned):**
```
          ┌─────────────────────────┐
          │ I'm doing great!        │  bg-primary text-primary-foreground rounded-lg rounded-tr-sm
          └─────────────────────────┘
                            10:31 AM ✓✓
```

| Element | Spec |
|---------|------|
| **Other bubble** | `bg-muted text-foreground rounded-lg rounded-tl-sm px-3 py-2 max-w-[75%]` |
| **Own bubble** | `bg-primary text-primary-foreground rounded-lg rounded-tr-sm px-3 py-2 max-w-[75%]` |
| **Avatar** | 32px. Only on first message of a consecutive group from same sender. Invisible spacer (`w-8`) on grouped messages to maintain alignment. |
| **Sender name** | GROUP only, not DIRECT. `text-[11px] font-medium text-muted-foreground mb-0.5` above bubble. Only on first in group. |
| **Timestamp** | `text-[10px] text-muted-foreground mt-0.5`. Only on last message in group. Format: `h:mm A` (e.g., "2:30 PM"). |
| **Read receipt** | Own messages only. `Check` icon = sent. `CheckCheck` icon = read (other user's `lastReadSeq >= message.seqNumber`). `text-[10px]` after timestamp. |
| **Pending** | `opacity-50` until ack received. |
| **Failed** | `AlertCircle` icon (red) + `"Tap to retry"` text below bubble. `cursor-pointer` on click retries with same `clientId`. |
| **SYSTEM message** | Centered, no bubble. `text-xs text-muted-foreground italic`. E.g., `"Alice added Bob"`. |

### Message Grouping Rules

- Consecutive messages from same sender within **2 minutes** are grouped
- First in group: show avatar + sender name (GROUP only)
- Middle in group: hide avatar (use spacer), hide sender, hide timestamp
- Last in group: show timestamp
- Single message (no group): show avatar + sender + timestamp

### Scroll Behavior

| Scenario | Action |
|----------|--------|
| Initial load | Scroll to bottom (newest messages) |
| New message + user at bottom | Auto-scroll to bottom |
| New message + user scrolled up | Show `NewMessagesPill` floating at bottom. Do NOT auto-scroll. |
| Scroll to top | Trigger `fetchNextPage()` via `useInfiniteQuery`. Show spinner at top. |
| Click "New messages" pill | Smooth-scroll to bottom. Hide pill. |

**Scroll detection:** Use `IntersectionObserver` on a sentinel div at the bottom. If visible = "at bottom". If not visible = "scrolled up".

### Typing Indicator

**Component:** `components/chat/typing-indicator.tsx`

```
[Avatar] ● ● ●  John is typing...
```

- Rendered at the bottom of the message list, above the input bar
- 3 dots with CSS bounce animation (staggered 0.15s delay each)
- `text-xs text-muted-foreground`
- DIRECT: `"{name} is typing..."`
- GROUP: `"{name} is typing..."` or `"{name1} and {name2} are typing..."` or `"{count} people are typing..."`
- Data source: `chatStore.typingUsers[conversationId]`
- Client safety: auto-clear after 6s of no `user_typing` re-emission

### New Messages Pill

**Component:** `components/chat/new-messages-pill.tsx`

```
          ┌──────────────────┐
          │ ↓ New messages   │
          └──────────────────┘
```

- Floating, centered horizontally, 16px above the input bar
- `bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full shadow-md cursor-pointer`
- `ArrowDown` icon (lucide) 14px before text
- Shows when: new message arrives AND user is scrolled up
- Hides when: user scrolls to bottom or clicks the pill
- Animate in: `animate-in fade-in slide-in-from-bottom-2`

### Data Source

```typescript
const {
  data, fetchNextPage, hasNextPage, isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ['messages', conversationId],
  queryFn: ({ pageParam }) =>
    api.get(`/chat/conversations/${conversationId}/messages`, {
      params: { limit: 30, ...(pageParam ? { before: pageParam } : {}) },
    }).then(r => r.data),
  getNextPageParam: (lastPage) =>
    lastPage.hasMore ? lastPage.data[lastPage.data.length - 1]?.id : undefined,
  enabled: !!conversationId,
});
```

---

## 15.6 Message Input Bar

**Component:** `components/chat/message-input.tsx`

```
+------------------------------------------------------------+
| [📎]  Type a message...                          [Send ➤]  |
+------------------------------------------------------------+
```

| Element | Spec |
|---------|------|
| **Attachment** | `Paperclip` icon (lucide). `variant="ghost" size="icon"`. Disabled (future feature). `text-muted-foreground`. |
| **Text input** | `<textarea>` with auto-resize. Min 1 row, max 5 rows. `resize-none border-0 focus:ring-0 flex-1 text-sm`. Placeholder: `"Type a message..."`. |
| **Send button** | `SendHorizonal` icon (lucide). `bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center`. Disabled when input is empty (trimmed). `opacity-50` when disabled. |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message (if not empty) |
| `Shift + Enter` | Insert newline |
| `Escape` | Blur input |

### Typing Events

```
User types -> debounce 300ms -> emit 'typing_start'
User stops typing for 3s -> emit 'typing_stop'
User sends message -> emit 'typing_stop' + clear debounce
```

Implementation:
```typescript
const typingTimeoutRef = useRef<NodeJS.Timeout>();
const lastTypingRef = useRef<number>(0);

const handleInputChange = (value: string) => {
  setText(value);
  const now = Date.now();
  if (now - lastTypingRef.current > 300) {
    socket.emit('typing_start', { conversationId });
    lastTypingRef.current = now;
  }
  clearTimeout(typingTimeoutRef.current);
  typingTimeoutRef.current = setTimeout(() => {
    socket.emit('typing_stop', { conversationId });
  }, 3000);
};
```

### Send Flow

1. `clientId = crypto.randomUUID()`
2. Optimistically append message to React Query cache with `status: 'pending'`
3. Clear input immediately
4. `socket.emit('send_message', { conversationId, content, clientId }, callback)`
5. **Ack success:** Replace optimistic message with server-confirmed message (has `id`, `seqNumber`, `createdAt`)
6. **Ack error:** Mark message `status: 'failed'`
7. **No ack in 5 seconds:** Mark as failed
8. **Retry:** User clicks failed message -> re-emit with same `clientId` (idempotent)

---

## 15.7 Create Group Modal

**Component:** `components/chat/create-group-modal.tsx`

**Trigger:** "+ New Group" button in sidebar.

Uses Radix UI `Dialog` (existing `components/ui/dialog.tsx`).

```
+--------------------------------------+
|  Create Group Chat               [X] |
+--------------------------------------+
|                                       |
|  Group Name *                         |
|  ┌──────────────────────────────────┐ |
|  │ Enter group name...              │ |
|  └──────────────────────────────────┘ |
|                                       |
|  Add Members *                        |
|  ┌──────────────────────────────────┐ |
|  │ 🔍 Search users by name...      │ |
|  └──────────────────────────────────┘ |
|                                       |
|  ┌──────────────────────────────────┐ |
|  │ [Avatar] John Doe          [Add] │ |
|  │ [Avatar] Jane Smith        [Add] │ |
|  │ [Avatar] Bob Wilson     [Added✓] │ |
|  └──────────────────────────────────┘ |
|                                       |
|  Selected (2):                        |
|  [Bob Wilson ✕] [Jane Smith ✕]       |
|                                       |
|  [Cancel]              [Create Group] |
+--------------------------------------+
```

| Element | Spec |
|---------|------|
| **Group Name** | `Input` component. Required. 2-100 chars. |
| **Search** | Server-side user search via `GET /api/users/search?q=...`. Debounce 500ms. Min 2 chars to trigger. Excludes current user. |
| **User list** | Scrollable, max-height `240px`. Each row: 32px avatar + displayName + email (muted) + Add/Added toggle button. |
| **Add button** | `variant="outline" size="sm"`. Toggles to `variant="secondary"` with `Check` icon when selected. |
| **Selected chips** | `Badge` components with `X` icon to deselect. Wrap horizontally. |
| **Create button** | `variant="default"`. Disabled until: name >= 2 chars AND >= 1 member selected. Shows spinner during API call. |
| **Cancel** | `variant="ghost"`. Closes dialog. |

**On create:**
1. `POST /api/chat/conversations` with `{ type: 'GROUP', name, memberIds }`
2. `toast.success('Group "{name}" created')`
3. Close modal
4. Invalidate `['conversations']`
5. Set new conversation as active
6. Emit `join_conversation` for the new conversation

---

## 15.8 Group Info Drawer

**Component:** `components/chat/group-info-drawer.tsx`

**Trigger:** Info button (`ℹ️`) in conversation header for GROUP conversations.

Uses Radix UI `Sheet` (existing `components/ui/sheet.tsx`), side `"right"`, width `320px`.

```
+-------------------------------+
|  Group Info               [X] |
+-------------------------------+
|                               |
|  [GroupAvatar 64px]           |
|  Study Group          [Edit✏️]|
|  Created Mar 20, 2026        |
|                               |
|  ─────────────────────────── |
|                               |
|  Members (5)          [Add+]  |
|  ┌───────────────────────────┐|
|  │ [Avatar] You       ADMIN  │|
|  │ [Avatar] John Doe  MEMBER │|
|  │ [Avatar] Jane      MEMBER │|
|  │ ...                        |
|  └───────────────────────────┘|
|                               |
|  ─────────────────────────── |
|                               |
|  [🚪 Leave Group]            |
+-------------------------------+
```

| Element | Spec |
|---------|------|
| **Group avatar** | 64px. `avatarUrl` or `Users` icon in muted circle. |
| **Edit button** | ADMIN only. `Pencil` icon. Inline edit: replaces name with input + Save/Cancel buttons. Calls `PATCH /api/chat/conversations/:id`. |
| **Created date** | `text-xs text-muted-foreground`. Format: `"Created MMM DD, YYYY"`. |
| **Add button** | ADMIN only. `UserPlus` icon. Opens a small popover/dialog with user search (same as create group modal search). Calls `POST .../members`. |
| **Member list** | Scrollable. Each row: 32px avatar + displayName + role badge (`Badge variant="outline"` for MEMBER, `Badge variant="default"` for ADMIN). |
| **Member actions** | ADMIN sees `MoreVertical` icon on other members -> `DropdownMenu` with "Remove from group" (red text). Calls `DELETE .../members/:userId`. `ConfirmDialog` before removal. |
| **Leave button** | `text-red-500 hover:text-red-600`. `LogOut` icon + "Leave Group". Full width, bottom of drawer. `ConfirmDialog`: "Are you sure you want to leave this group?" with danger variant. |

**On leave:**
1. `DELETE /api/chat/conversations/:id/members/:currentUserId`
2. `toast.info('You left "{name}"')`
3. Close drawer
4. Set `activeConversationId = null`
5. Invalidate `['conversations']`
6. Emit `leave_conversation`

---

## 15.9 Empty States

### No Conversation Selected (desktop, right panel)

```
+--------------------------------------+
|                                      |
|        [MessageSquare icon 48px]     |
|        text-muted-foreground         |
|                                      |
|     Select a conversation            |
|     or start a new one               |
|                                      |
+--------------------------------------+
```

- `MessageSquare` icon (lucide), 48px, `text-muted-foreground/50`
- Text: `text-sm text-muted-foreground` centered

### No Conversations at All (sidebar empty)

```
+-----------------------------+
|                             |
|   [MessageSquare icon]      |
|   No conversations yet      |
|   Start a chat with         |
|   someone!                  |
|                             |
|   [Start a Chat]            |
+-----------------------------+
```

- "Start a Chat" button opens a user search modal (same search as group modal but creates DIRECT conversation)

### Empty Conversation (no messages)

```
          [Sparkles icon]
     No messages yet. Say hello! 👋
```

- Centered in message area. `text-sm text-muted-foreground`.

---

## 15.10 Start Chat Modal (New Direct Conversation)

**Component:** Reuse user search pattern from Create Group.

**Trigger:** "Start a Chat" button in empty state, OR a new button in the sidebar header.

```
+--------------------------------------+
|  New Conversation                [X] |
+--------------------------------------+
|                                       |
|  ┌──────────────────────────────────┐ |
|  │ 🔍 Search users by name...      │ |
|  └──────────────────────────────────┘ |
|                                       |
|  ┌──────────────────────────────────┐ |
|  │ [Avatar] Alice Wong              │ |-> Click -> creates DIRECT, navigates
|  │ alice@example.com                │ |
|  ├──────────────────────────────────┤ |
|  │ [Avatar] David Lee               │ |
|  │ david@example.com                │ |
|  └──────────────────────────────────┘ |
+--------------------------------------+
```

- Click on a user row: `POST /api/chat/conversations { type: 'DIRECT', memberId }`, set as active, close modal.
- Shows existing conversations first if a DIRECT conversation already exists (200 response from API).

---

## 15.11 Loading & Error States

### Conversation List

| State | UI |
|-------|-----|
| Loading | 5 skeleton rows: `Skeleton` circle (40px) + 2 `Skeleton` text lines (60% and 40% width) |
| Error | Red text `"Failed to load conversations"` + `Button variant="ghost" size="sm"` "Retry" |
| Empty | See 15.9 |

### Message Area

| State | UI |
|-------|-----|
| Loading initial messages | `Loader2` icon (lucide) spinning, centered in message area |
| Loading older (scroll up) | Small `Loader2` spinner at the very top of message list, `h-8` |
| Empty conversation | See 15.9 |
| Connection lost | Yellow banner at top of message area: `AlertTriangle` icon + `"Reconnecting..."` + spinning `Loader2`. `bg-yellow-50 text-yellow-800 border-b border-yellow-200 px-3 py-1.5 text-xs` |
| Connection restored | Green banner briefly: `CheckCircle` + `"Connected"`. Auto-dismiss after 2s. |

### User Search (in modals)

| State | UI |
|-------|-----|
| Loading | 3 skeleton rows |
| No results | `"No users found"` centered, muted text |
| Min chars | `"Type at least 2 characters to search"` centered, muted text |

---

## 15.12 Toast Notifications

Uses `sonner` (existing pattern).

| Event | Toast |
|-------|-------|
| Group created | `toast.success('Group "{name}" created')` |
| Left group | `toast.info('You left "{name}"')` |
| Member added | `toast.success('{name} added to group')` |
| Member removed | `toast.info('{name} removed from group')` |
| Message send failed | `toast.error('Failed to send message')` |
| Rate limited | `toast.error('Slow down! Too many messages')` |
| Connection lost | `toast.warning('Connection lost. Reconnecting...')` |
| Connection restored | `toast.success('Connected')` |

---

## 15.13 Socket Connection Lifecycle (Frontend)

### Connect

**File:** `apps/web/src/app/(learner)/layout.tsx`

After session restore (`api.get('/users/me')` succeeds):
```typescript
import { connectSocket } from '@/lib/socket';
// ... inside useEffect after setUser(data):
connectSocket(localStorage.getItem('accessToken'));
```

### Disconnect

**File:** `apps/web/src/lib/auth-store.ts`

In `logout()` action:
```typescript
import { disconnectSocket } from '@/lib/socket';
// ... inside logout:
disconnectSocket();
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
set({ user: null, isAuthenticated: false });
```

### Socket Manager

**File:** `apps/web/src/lib/socket.ts`

```typescript
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000')
  .replace('/api', '');

let socket: Socket | null = null;

export function connectSocket(token: string | null): Socket {
  if (socket?.connected) return socket;
  if (!token) throw new Error('No auth token');

  socket = io(`${SOCKET_URL}/chat`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.on('auth_error', () => {
    disconnectSocket();
    // Attempt token refresh + reconnect
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
```

### Room Management

**File:** `apps/web/src/features/chat/hooks/use-socket-events.ts`

When chat page mounts:
```typescript
// After conversations load, join all rooms
conversations.forEach(conv => {
  socket.emit('join_conversation', { conversationId: conv.id });
});
```

When chat page unmounts (cleanup):
```typescript
conversations.forEach(conv => {
  socket.emit('leave_conversation', { conversationId: conv.id });
});
```

### Socket Event Listener Hook

```typescript
export function useSocketEvents() {
  const queryClient = useQueryClient();
  const { setTyping, setUserOnline } = useChatStore();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNewMessage = (msg: Message) => {
      queryClient.setQueryData(['messages', msg.conversationId], (old) => appendMessage(old, msg));
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const onMessageRead = (data: { conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    socket.on('new_message', onNewMessage);
    socket.on('message_read', onMessageRead);
    socket.on('user_typing', ({ conversationId, userId, displayName }) =>
      setTyping(conversationId, userId, displayName, true));
    socket.on('user_stop_typing', ({ conversationId, userId }) =>
      setTyping(conversationId, userId, '', false));
    socket.on('user_online', ({ userId }) => setUserOnline(userId, true));
    socket.on('user_offline', ({ userId }) => setUserOnline(userId, false));

    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('message_read', onMessageRead);
      socket.off('user_typing');
      socket.off('user_stop_typing');
      socket.off('user_online');
      socket.off('user_offline');
    };
  }, []);
}
```

---

## 15.14 Component File Summary

```
apps/web/src/
  app/(learner)/chat/page.tsx              # Route entry, 'use client'

  components/chat/
    chat-layout.tsx                        # flex: sidebar (w-80) + message area (flex-1)
    conversation-list.tsx                  # Search + scroll list + "New Group" + "Start Chat"
    conversation-item.tsx                  # Single row: avatar, online, name, time, preview, badge
    message-area.tsx                       # Header + scroll messages + input
    message-bubble.tsx                     # Left/right bubble + avatar + time + read receipt
    message-input.tsx                      # Textarea + send + typing events
    typing-indicator.tsx                   # Animated "X is typing..." dots
    create-group-modal.tsx                 # Dialog: name + user search + member chips
    start-chat-modal.tsx                   # Dialog: user search -> create DIRECT
    group-info-drawer.tsx                  # Sheet: avatar, name, members, roles, leave
    date-separator.tsx                     # "── March 26 ──" between days
    new-messages-pill.tsx                  # Floating "↓ New messages" button

  features/chat/hooks/
    use-chat.ts                            # useConversations, useMessages, useCreateConversation
    use-socket-events.ts                   # Socket event listener + state sync

  lib/
    socket.ts                              # connect / disconnect / getSocket
    chat-store.ts                          # Zustand: active, typing, online, sidebar
```

---

## 15.15 Accessibility

| Feature | Implementation |
|---------|---------------|
| Keyboard navigation | Tab through conversation list, Enter to select. Tab to input, Enter to send. |
| Screen reader | `aria-label` on conversation items (e.g., "Chat with John Doe, 3 unread messages"). `role="log"` on message area. `aria-live="polite"` on typing indicator. |
| Focus management | Auto-focus message input when conversation is selected. Return focus to conversation list on back (mobile). |
| Color contrast | All text meets WCAG AA. Unread badge uses primary color (already high contrast). Online dot uses `bg-green-500` on white (passes AA). |
| Reduced motion | Typing dots animation respects `prefers-reduced-motion: reduce` (static dots). |
