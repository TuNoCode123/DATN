# Chat & Friendship System - Implementation Plan (v2)

## Context
Add real-time chat and friendship features to the IELTS learning platform. Currently the app has zero WebSocket/Socket.io support. This plan adds friendship management (REST), 1-to-1 + group chat (REST + WebSocket), typing indicators, and online status.

**Architecture:** Single NestJS server, WebSocket + REST in same app, PostgreSQL, no Kafka/microservices.

---

## Phase 1: Prisma Schema + Migration

**File:** `apps/api/prisma/schema.prisma`

### New enums
```prisma
enum FriendshipStatus { PENDING  ACCEPTED  BLOCKED }
enum ConversationType { DIRECT  GROUP }
enum MessageType      { TEXT  IMAGE  SYSTEM }
enum MemberRole       { ADMIN  MEMBER }
```

### New models

**Friendship**
```prisma
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
```

**Conversation**
```prisma
model Conversation {
  id              String           @id @default(cuid())
  type            ConversationType @default(DIRECT)
  name            String?
  avatarUrl       String?
  createdBy       String?
  lastMessageSeq  Int              @default(0)    // seq of latest message (for unread calc)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  // DIRECT dedup: sorted pair stored here (FIX #2)
  directUserA     String?          // lower cuid of the two users (null for GROUP)
  directUserB     String?          // higher cuid of the two users (null for GROUP)

  members  ConversationMember[]
  messages Message[]

  @@unique([directUserA, directUserB])  // prevents duplicate DIRECT conversations
  @@index([updatedAt])
  @@map("conversations")
}
```
> **FIX #2 - DIRECT race condition:** For DIRECT conversations, sort the two user IDs lexicographically and store in `directUserA`/`directUserB`. The `@@unique` constraint prevents duplicates at the DB level even under concurrent requests. GROUP conversations leave these null.

**ConversationMember**
```prisma
model ConversationMember {
  id                String     @id @default(cuid())
  conversationId    String
  userId            String
  role              MemberRole @default(MEMBER)
  lastReadSeq       Int        @default(0)    // seq of last message user has read
  joinedAt          DateTime   @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([userId])
  @@map("conversation_members")
}
```
> **FIX #1 - Unread count:** `unread = conversation.lastMessageSeq - member.lastReadSeq`. Pure integer subtraction, zero queries needed beyond the conversation list fetch. No COUNT, no subquery.

**Message**
```prisma
model Message {
  id             String      @id @default(cuid())
  conversationId String
  senderId       String
  type           MessageType @default(TEXT)
  content        String
  clientId       String?     // client-generated UUID for idempotency (FIX #3)
  seqNumber      Int         // sequential within conversation
  createdAt      DateTime    @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@unique([conversationId, clientId])    // FIX #3: prevents duplicate messages
  @@unique([conversationId, seqNumber])   // guarantees ordering
  @@index([conversationId, id])           // FIX #4: efficient cursor pagination
  @@map("messages")
}
```
> **FIX #3 - Idempotent messages:** Client sends a `clientId` (UUID v4) with each message. DB constraint `@@unique([conversationId, clientId])` rejects duplicates. On conflict, return the existing message instead of error.
>
> **FIX #4 - Pagination index:** `@@index([conversationId, id])` enables efficient cursor-based queries: `WHERE conversationId = X AND id < cursor ORDER BY id DESC LIMIT 30`.

### User model additions
Add to existing User model:
```prisma
sentFriendRequests     Friendship[]         @relation("FriendshipRequester")
receivedFriendRequests Friendship[]         @relation("FriendshipAddressee")
conversationMembers    ConversationMember[]
messages               Message[]
```

### Migration
```bash
npx prisma migrate dev --name add_friendship_and_chat
```

---

## Phase 2: Backend - Friendships Module (REST only)

### File structure
```
apps/api/src/friendships/
  friendships.module.ts
  friendships.controller.ts
  friendships.service.ts
  dto/send-friend-request.dto.ts
  dto/respond-friend-request.dto.ts
```

### REST endpoints (`@Controller('friendships')`, all `@UseGuards(JwtAuthGuard)`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/friendships/request` | Send request (validates: not self, no duplicate, not blocked) |
| PATCH | `/friendships/:id/respond` | Accept/reject (addressee only). Accept=ACCEPTED, reject=delete row |
| DELETE | `/friendships/:id` | Unfriend (either party, hard delete) |
| POST | `/friendships/:id/block` | Block user |
| DELETE | `/friendships/:id/block` | Unblock (delete row) |
| GET | `/friendships` | List accepted friends (paginated, searchable) |
| GET | `/friendships/requests` | List pending requests (`?type=sent\|received`) |
| GET | `/friendships/status/:userId` | Get status with specific user |

Export `areFriends(userA, userB): Promise<boolean>` for chat module.

Register in `app.module.ts`.

---

## Phase 3: Backend - Chat Module (REST + WebSocket)

### Install
```bash
cd apps/api && npm install @nestjs/websockets @nestjs/platform-socket.io
```

### File structure
```
apps/api/src/chat/
  chat.module.ts
  chat.controller.ts
  chat.service.ts
  chat.gateway.ts
  dto/create-conversation.dto.ts
  dto/query-messages.dto.ts
  dto/send-message.dto.ts
```

### ChatModule imports
- `FriendshipsModule` (friend check for DIRECT conversations)
- `JwtModule.registerAsync(...)` (gateway JWT verification)

### REST endpoints (`@Controller('chat')`, all `@UseGuards(JwtAuthGuard)`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat/conversations` | Create conversation (DIRECT uses sorted-pair dedup, GROUP with name+members) |
| GET | `/chat/conversations` | List conversations (includes: lastMessage, unreadCount via `lastMessageSeq - lastReadSeq`, ordered by updatedAt DESC) |
| GET | `/chat/conversations/:id` | Conversation detail with members |
| GET | `/chat/conversations/:id/messages` | Cursor-paginated (`?limit=30&before=messageId`) |
| PATCH | `/chat/conversations/:id` | Update group name/avatar (ADMIN role only) |
| POST | `/chat/conversations/:id/members` | Add members to group (ADMIN only) |
| DELETE | `/chat/conversations/:id/members/:userId` | Remove member (ADMIN) or leave (self) |
| PATCH | `/chat/conversations/:id/read` | Mark read (set `lastReadSeq` to given seq number) |

### DIRECT conversation creation flow (FIX #2)
```
1. Sort IDs: [userA, userB] = [currentUser, targetUser].sort()
2. prisma.conversation.upsert({
     where: { directUserA_directUserB: { directUserA: userA, directUserB: userB } },
     create: { type: DIRECT, directUserA: userA, directUserB: userB, members: { create: [...] } },
     update: {}  // return existing
   })
3. DB unique constraint guarantees no race condition duplicates
```

### Message creation flow (FIX #1 + #3)
```
1. Client sends: { conversationId, content, type?, clientId }
2. Transaction:
   a. Increment conversation.lastMessageSeq by 1
   b. Insert message with seqNumber = new lastMessageSeq, clientId = dto.clientId
   c. Update conversation.updatedAt (for sort order)
3. On unique constraint violation (clientId duplicate) -> return existing message
4. Broadcast to room
```

### WebSocket Gateway

```typescript
@WebSocketGateway({ namespace: '/chat', cors: { origin: FRONTEND_URL, credentials: true } })
```

**Auth on connect (FIX #8):**
1. Extract JWT from `client.handshake.auth.token`
2. Verify with `jwtService.verify(token)` — reject if expired/invalid
3. On failure: `client.emit('auth_error', { message: 'Token expired' })` then `client.disconnect(true)`
4. On success: attach `client.data.user = { id, email, role }`
5. **Do NOT auto-join rooms** (FIX #5) — client must explicitly emit `join_conversation` per room

**Presence tracking (FIX #6):**
```
Private map: Map<string, Set<string>> = userId -> Set<socketId>

handleConnection(client):
  - add socketId to user's Set
  - if Set size went from 0->1: broadcast 'user_online' to user's friends/peers

handleDisconnect(client):
  - remove socketId from user's Set
  - if Set is now empty:
    - clear any typing states for this user (FIX #7)
    - broadcast 'user_offline' with lastSeen timestamp
```

**Typing TTL (FIX #7):**
```
Private map: Map<string, NodeJS.Timeout> = `${conversationId}:${userId}` -> timeout

on 'typing_start':
  - clear existing timeout if any
  - set new timeout (5 seconds) that auto-emits 'user_stop_typing'
  - broadcast 'user_typing' to room (excl sender)

on 'typing_stop':
  - clear timeout
  - broadcast 'user_stop_typing' to room (excl sender)

on disconnect:
  - clear all timeouts for this user
  - broadcast 'user_stop_typing' for any active conversations
```

### Socket events

| Client Event | Handler | Server Emits |
|-------------|---------|-------------|
| `send_message` | Validate membership, save to DB (with clientId dedup), increment seq | `new_message` to room via `socket.to(room)` (FIX #10: excludes sender) |
| `mark_read` | Update member.lastReadSeq | `message_read` to room |
| `join_conversation` | Validate membership, `client.join(room)` | - |
| `leave_conversation` | `client.leave(room)` (Socket.io room only, not DB) | - |
| `typing_start` | Set TTL timeout, broadcast | `user_typing` to room (excl sender) |
| `typing_stop` | Clear TTL timeout, broadcast | `user_stop_typing` to room (excl sender) |

**FIX #10 - Sender exclusion:** Use `socket.to(room).emit(...)` instead of `server.to(room).emit(...)`. Sender updates their own UI optimistically from the `send_message` call's acknowledgement callback. Gateway sends ack back to sender with the saved message (including `id`, `seqNumber`, `createdAt`).

**FIX #11 - Rate limiting (basic):**
```
Private map: Map<string, number[]> = userId -> array of recent message timestamps
On 'send_message':
  - filter timestamps to last 5 seconds
  - if count >= 10: emit('error', { message: 'Rate limited' }), return
  - else: push Date.now(), proceed
```
Simple in-memory rate limiter. 10 messages per 5 seconds per user. No Redis needed.

### Message flow (complete)
```
Client emits 'send_message' { conversationId, content, clientId }
  -> Gateway: check rate limit (FIX #11)
  -> Gateway: validate client.data.user is member of conversation
  -> ChatService.createMessage(conversationId, senderId, content, clientId)
      -> Transaction:
        1. UPDATE conversation SET lastMessageSeq = lastMessageSeq + 1, updatedAt = now() RETURNING lastMessageSeq
        2. INSERT message (seqNumber = lastMessageSeq, clientId)
        3. On clientId conflict -> SELECT existing message, return it (FIX #3)
  -> socket.to(room).emit('new_message', message)    // excludes sender (FIX #10)
  -> callback(message) to sender                       // ack with saved message
```

Register `ChatModule` in `app.module.ts`.

---

## Phase 4: Frontend - Socket.io Client + Stores

### Install
```bash
cd apps/web && npm install socket.io-client
```

### `apps/web/src/lib/socket.ts` — Socket.io singleton
```
connectSocket(token): connect to SOCKET_URL/chat with auth.token
disconnectSocket(): disconnect and null out
getSocket(): return current instance

// FIX #8: Handle auth errors
socket.on('auth_error') -> disconnectSocket(), refresh token, reconnect
socket.on('connect_error') -> same flow
```

### `apps/web/src/lib/chat-store.ts` — Zustand (FIX #9: UI-only state)
```
Zustand manages ONLY:
  - activeConversationId: string | null
  - typingUsers: Record<conversationId, { userId, displayName }[]>
  - onlineUsers: Set<string>

React Query manages ALL server state:
  - conversations list (useQuery)
  - messages per conversation (useInfiniteQuery)
  - unread counts (derived from conversations query)
```
> **FIX #9:** No duplication. Zustand = ephemeral UI state (typing, online, active view). React Query = server-synced state (conversations, messages). Socket events invalidate React Query cache for server state, update Zustand directly for ephemeral state.

### Integration points
- `apps/web/src/app/(learner)/layout.tsx` — `connectSocket()` after session restore
- `apps/web/src/lib/auth-store.ts` — `disconnectSocket()` on logout

---

## Phase 5: Frontend - Friendships UI

### Files
```
apps/web/src/features/friendships/hooks/use-friendships.ts
apps/web/src/components/friends/friends-list.tsx
apps/web/src/components/friends/friend-card.tsx
apps/web/src/components/friends/friend-requests.tsx
apps/web/src/components/friends/user-search-modal.tsx
apps/web/src/app/(learner)/friends/page.tsx
```

### React Query hooks
- `useFriends()`, `useFriendRequests(type)`, `useFriendshipStatus(userId)`
- `useSendFriendRequest()`, `useRespondFriendRequest()`, `useUnfriend()`

---

## Phase 6: Frontend - Chat UI

### Files
```
apps/web/src/features/chat/hooks/use-chat.ts
apps/web/src/features/chat/hooks/use-socket-events.ts
apps/web/src/components/chat/chat-layout.tsx
apps/web/src/components/chat/conversation-list.tsx
apps/web/src/components/chat/conversation-item.tsx
apps/web/src/components/chat/message-area.tsx
apps/web/src/components/chat/message-bubble.tsx
apps/web/src/components/chat/message-input.tsx
apps/web/src/components/chat/typing-indicator.tsx
apps/web/src/components/chat/create-group-modal.tsx
apps/web/src/app/(learner)/chat/page.tsx
```

### `use-socket-events.ts` — Event listener hook
```
on 'new_message':
  -> queryClient.invalidateQueries(['conversations'])  // refresh list + unread
  -> queryClient.setQueryData(['messages', convId], append message)

on 'user_typing' / 'user_stop_typing':
  -> chatStore.setTyping(...)  // Zustand only, no React Query

on 'user_online' / 'user_offline':
  -> chatStore.setUserOnline(...)  // Zustand only

on 'message_read':
  -> queryClient.invalidateQueries(['conversations'])  // refresh read status
```

### Sending a message (client-side, FIX #10)
```
1. Generate clientId = crypto.randomUUID()
2. Optimistically add message to local React Query cache (pending state)
3. socket.emit('send_message', { conversationId, content, clientId }, (ackMessage) => {
     // Replace optimistic message with server-confirmed message (has id, seqNumber, createdAt)
   })
4. If no ack within 5s -> mark message as failed, allow retry (same clientId = idempotent)
```

### Joining conversations (FIX #5)
```
When user opens /chat page:
  1. Fetch conversations via REST (React Query)
  2. For each conversation, emit 'join_conversation' { conversationId }

When user navigates away from /chat:
  3. Emit 'leave_conversation' for each joined room
```

---

## Improvements Summary

| # | Priority | Fix | How |
|---|----------|-----|-----|
| 1 | HIGH | Unread COUNT query | `lastMessageSeq - lastReadSeq` (integer math, no query) |
| 2 | HIGH | DIRECT race condition | `directUserA`/`directUserB` sorted pair + `@@unique` constraint |
| 3 | HIGH | Idempotent messages | `clientId` UUID + `@@unique([conversationId, clientId])` |
| 4 | HIGH | Message pagination index | `@@index([conversationId, id])` |
| 5 | MEDIUM | Auto-join all rooms | Client explicitly joins via `join_conversation` event |
| 6 | MEDIUM | Presence cleanup | `Map<userId, Set<socketId>>`, clean on disconnect |
| 7 | MEDIUM | Stuck typing | 5s TTL timeout, auto-clear on disconnect |
| 8 | MEDIUM | Expired WS auth | Verify JWT on connect, reject expired, client handles `auth_error` |
| 9 | LOW | Duplicate state | Zustand = UI-only, React Query = server state |
| 10 | LOW | Echo to sender | `socket.to(room)` excludes sender, ack callback for confirmation |
| 11 | LOW | Rate limiting | In-memory: 10 msgs / 5 sec per user |
| 12 | LOW | Redis caching | Not implemented now. Future: cache recent messages, swap presence map |

---

## Key Design Decisions

1. **`lastMessageSeq` + `lastReadSeq`** — integer subtraction for unread, zero extra queries
2. **Sorted-pair unique constraint** — DB-level DIRECT conversation dedup, race-condition proof
3. **`clientId` idempotency** — safe retries, no duplicate messages
4. **Explicit room joins** (not auto) — client controls which rooms to listen to
5. **`socket.to(room)`** — excludes sender, optimistic UI + ack callback
6. **Typing TTL** — 5s auto-expire, cleanup on disconnect
7. **1 message = 1 DB insert** — room broadcast, no per-user records
8. **In-memory presence** — sufficient for single server, Redis-swappable later
9. **Cursor pagination** — `WHERE id < cursor ORDER BY id DESC`, backed by composite index

---

## Verification

1. **Migration:** `npx prisma migrate dev` succeeds, verify tables + indexes in DB
2. **Friendships:** Test all CRUD via REST with JWT auth
3. **DIRECT dedup:** Two concurrent `POST /chat/conversations` with same users -> same conversation returned
4. **Idempotency:** Send same `clientId` twice -> same message returned, no duplicate
5. **WebSocket auth:** Connect with expired token -> `auth_error` emitted, disconnected
6. **Message flow:** Send from user A, verify user B receives via socket (not echo to A)
7. **Unread:** Send 5 messages, verify `lastMessageSeq - lastReadSeq = 5`
8. **Typing TTL:** Start typing, disconnect -> other user sees typing stop within 5s
9. **Rate limit:** Send 15 messages rapidly -> last 5 rejected with error
10. **Pagination:** Load 100 messages, scroll up -> cursor pagination loads older batches correctly
