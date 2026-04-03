# Real-Time Chat System — WebSocket Architecture Design

> NestJS + Socket.IO + Redis Adapter + PostgreSQL

---

## 1. Room Strategy

### Two types of rooms

```
user:{userId}              — Joined on connect, left on disconnect
conversation:{conversationId}  — Joined when user OPENS a conversation, left when they navigate away
```

| Room | When to join | When to leave | Purpose |
|------|-------------|---------------|---------|
| `user:{userId}` | Immediately on `handleConnection` | On `handleDisconnect` | Deliver events to a user **anywhere** in the app (conversation list, notifications, etc.) |
| `conversation:{conversationId}` | User opens a chat thread (`join_conversation`) | User navigates away (`leave_conversation`) or disconnects | Typing indicators, read receipts — things only relevant to **active viewers** |

### Why two rooms?

```
Problem (current):
  User A sends message → broadcast to conversation:{id} room
  User B is online but on the conversation LIST page → NOT in the room → misses the event

Solution:
  Broadcast to user:{userId} room for ALL members
  → User B receives new_message regardless of where they are in the app
```

### Join flow

```
handleConnection(socket):
  1. Verify JWT
  2. socket.join(`user:${userId}`)          ← NEW: always join personal room
  3. Track socket in Redis: chat:user:{userId}:sockets
  4. Mark online in Redis: chat:online SET

join_conversation(conversationId):
  1. Verify membership
  2. socket.join(`conversation:${conversationId}`)

leave_conversation(conversationId):
  1. socket.leave(`conversation:${conversationId}`)

handleDisconnect(socket):
  1. socket leaves all rooms automatically (Socket.IO handles this)
  2. Clean up Redis tracking
```

---

## 2. Full Message Flow

### Sequence: Sending a message

```
Client A (Sender)                    Server (NestJS)                    Client B (Recipient)
      │                                    │                                    │
      │  emit('send_message', payload)     │                                    │
      │ ──────────────────────────────────>│                                    │
      │                                    │                                    │
      │                          ┌─────────┴─────────┐                          │
      │                          │  1. Rate limit     │                          │
      │                          │  2. Validate       │                          │
      │                          │  3. Assert member  │                          │
      │                          │  4. DB transaction: │                         │
      │                          │     - Increment seq │                         │
      │                          │     - Insert msg   │                          │
      │                          └─────────┬─────────┘                          │
      │                                    │                                    │
      │  callback({ success, message })    │                                    │
      │ <──────────────────────────────────│                                    │
      │                                    │                                    │
      │                          ┌─────────┴─────────┐                          │
      │                          │ For each member    │                          │
      │                          │ (except sender):   │                          │
      │                          │ emit to            │                          │
      │                          │ user:{memberId}    │                          │
      │                          └─────────┬─────────┘                          │
      │                                    │                                    │
      │                                    │   'new_message' to user:{B}        │
      │                                    │ ──────────────────────────────────>│
      │                                    │                                    │
```

### What happens at each recipient state

```
┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 1: User B is INSIDE the conversation (active chat)    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Receives: 'new_message' via user:{B} room                     │
│                                                                 │
│  Frontend:                                                      │
│    1. handleNewMessage() fires                                  │
│    2. Append message to React Query cache (messages list)       │
│    3. Auto-scroll to bottom                                     │
│    4. Invalidate conversations query (update sidebar preview)   │
│    5. Emit mark_read (since user is looking at it)              │
│                                                                 │
│  Result: Message appears instantly, marked as read              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 2: User B is ONLINE but on conversation list page     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Receives: 'new_message' via user:{B} room                     │
│                                                                 │
│  Frontend:                                                      │
│    1. handleNewMessage() fires                                  │
│    2. Messages cache for this conv doesn't exist → no-op        │
│    3. Invalidate conversations query → list refetches           │
│    4. Conversation item re-renders:                             │
│       - Updated last message preview                            │
│       - Updated timestamp                                       │
│       - Incremented unread badge                                │
│       - Conversation moves to top of list                       │
│                                                                 │
│  Result: Sidebar updates in real time, unread count goes up     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 3: User B is ONLINE but in a DIFFERENT conversation   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Same as Scenario 2 — user:{B} room delivers the event         │
│  Sidebar conversation list updates with new preview + badge     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 4: User B is OFFLINE                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  user:{B} room has 0 sockets → emit is a no-op                 │
│                                                                 │
│  When B comes back online:                                      │
│    1. Frontend fetches conversations list via REST API          │
│    2. API calculates: unread = lastMessageSeq - lastReadSeq     │
│    3. B sees updated unread counts and last message previews    │
│    4. When B opens the conversation → fetches messages via API  │
│                                                                 │
│  Result: No messages lost — DB is source of truth               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Event Structure & Routing

### Which room receives which event

| Event | Route to | Why |
|-------|----------|-----|
| `new_message` | `user:{memberId}` for each member | Must reach everyone, even those not viewing the conversation |
| `message_edited` | `user:{memberId}` for each member | Cached message content may be stale |
| `message_deleted` (everyone) | `user:{memberId}` for each member | Conversation list preview + cached messages |
| `message_read` | `conversation:{id}` room only | Only relevant to people actively viewing the chat |
| `reaction_updated` | `conversation:{id}` room only | Only relevant to active viewers; fresh fetch on open |
| `user_typing` | `conversation:{id}` room only | Ephemeral — only for active viewers |
| `user_stop_typing` | `conversation:{id}` room only | Ephemeral — only for active viewers |
| `user_online` | Global broadcast | Everyone needs presence updates |
| `user_offline` | Global broadcast | Everyone needs presence updates |
| `conversation_added` | `user:{memberId}` | New conversation must appear in their list |
| `member_added` | `user:{memberId}` | Added user needs to see the conversation |
| `member_removed` | `user:{memberId}` | Removed user needs to update their list |

### Event payloads

```typescript
// ── new_message ──────────────────────────
{
  id: "msg_abc123",
  conversationId: "conv_xyz",
  senderId: "user_1",
  sender: { id: "user_1", displayName: "Alice", avatarUrl: "..." },
  content: "Hello!",
  type: "TEXT",                    // TEXT | IMAGE | FILE | SYSTEM
  seqNumber: 42,
  clientId: "uuid-from-frontend",  // For optimistic update dedup
  createdAt: "2026-03-30T10:00:00Z",
  reactions: [],
  // Attachment fields (if IMAGE/FILE)
  attachmentUrl?: string,
  attachmentName?: string,
  attachmentSize?: number,
  attachmentType?: string,
}

// ── message_edited ───────────────────────
{
  conversationId: "conv_xyz",
  messageId: "msg_abc123",
  content: "Hello! (edited)",
  editedAt: "2026-03-30T10:05:00Z",
}

// ── message_deleted ──────────────────────
{
  conversationId: "conv_xyz",
  messageId: "msg_abc123",
  deletedForAll: true,
}

// ── message_read ─────────────────────────
{
  conversationId: "conv_xyz",
  userId: "user_2",
  lastReadSeq: 42,
}

// ── reaction_updated ─────────────────────
{
  conversationId: "conv_xyz",
  messageId: "msg_abc123",
  emoji: "👍",
  userId: "user_2",
  action: "add",                   // "add" | "remove"
  reactions: [
    { emoji: "👍", count: 2, userIds: ["user_1", "user_2"], reacted: true }
  ],
}

// ── user_typing / user_stop_typing ───────
{
  conversationId: "conv_xyz",
  userId: "user_2",
  displayName: "Bob",
}
```

---

## 4. Redis Adapter — How It Works Internally

### The problem it solves

```
Without Redis adapter:
  Server 1 has User A's socket
  Server 2 has User B's socket
  Server 1 does: server.to('user:B').emit(...)
  → Only checks Server 1's local sockets → User B never gets the message

With Redis adapter:
  Server 1 does: server.to('user:B').emit(...)
  → Publishes to Redis channel: "socket.io#/chat#user:B#"
  → Server 2 subscribes to that channel → finds User B's socket → delivers
```

### Internal flow

```
  Server 1                     Redis Pub/Sub                    Server 2
     │                              │                               │
     │  server.to('user:B')         │                               │
     │  .emit('new_message', data)  │                               │
     │                              │                               │
     │  ┌──────────────────┐        │                               │
     │  │ Redis Adapter    │        │                               │
     │  │ checks local     │        │                               │
     │  │ sockets first    │        │                               │
     │  │ (none for B)     │        │                               │
     │  └────────┬─────────┘        │                               │
     │           │                  │                               │
     │           │  PUBLISH         │                               │
     │           │  channel:        │                               │
     │           │  "socket.io#     │                               │
     │           │   /chat#"        │                               │
     │           ├─────────────────>│                               │
     │                              │  SUBSCRIBE                    │
     │                              │  (all servers listen)         │
     │                              ├──────────────────────────────>│
     │                              │                               │
     │                              │               ┌───────────────┤
     │                              │               │ Redis Adapter │
     │                              │               │ decodes msg   │
     │                              │               │ finds room    │
     │                              │               │ "user:B"      │
     │                              │               │ has socket    │
     │                              │               │ → deliver     │
     │                              │               └───────────────┤
     │                              │                               │
     │                              │                    emit to    │
     │                              │                    User B     │
     │                              │                               │
```

### Key details

- The adapter uses **two Redis clients**: one for PUBLISH, one for SUBSCRIBE
- Channel format: `socket.io#{namespace}#{room}#`
- Every `server.to(room).emit()` call is automatically fanned out to all servers
- `fetchSockets()` queries all servers via Redis and aggregates results
- Room membership is local per server — the adapter syncs events, not room state
- **Your `RedisIoAdapter` already sets this up correctly** in `redis-io.adapter.ts`

---

## 5. Unread Count

### Strategy: Database as source of truth

```
ConversationMember table:
  ├── lastReadSeq: number    (updated when user marks read)

Conversation table:
  ├── lastMessageSeq: number (incremented on every new message)

Unread count = lastMessageSeq - lastReadSeq
```

### When to increment (implicit)

```
New message created:
  → conversation.lastMessageSeq += 1 (DB transaction)
  → Every member's unread count automatically increases
  → No explicit "increment unread for each member" needed
```

### When to reset

```
User opens conversation OR receives a message while viewing it:
  → Frontend emits: mark_read({ conversationId, seqNumber: lastMessageSeq })
  → Backend updates: ConversationMember.lastReadSeq = seqNumber
  → Broadcast mark_read to conversation room (for read receipts)
  → Frontend invalidates conversations query → unread badge disappears
```

### Why DB, not Redis?

| | DB (current) | Redis |
|---|---|---|
| **Durability** | Survives restarts | Lost on eviction/restart |
| **Accuracy** | Always correct (single formula) | Needs sync logic, race conditions |
| **Simplicity** | One query in `listConversations` | Extra increment/decrement logic per member |
| **Offline users** | Automatically correct when they reconnect | Must backfill from DB anyway |

**Verdict**: DB-based `lastMessageSeq - lastReadSeq` is the right choice. Simple, correct, durable.

---

## 6. Sequence Diagrams

### Sending a message (single server)

```
Frontend (A)          Gateway              ChatService           PostgreSQL         Frontend (B)
    │                    │                      │                     │                  │
    │ send_message       │                      │                     │                  │
    │ {conversationId,   │                      │                     │                  │
    │  content, clientId}│                      │                     │                  │
    │───────────────────>│                      │                     │                  │
    │                    │ checkRateLimit()      │                     │                  │
    │                    │─────(Redis)──────>    │                     │                  │
    │                    │<────(ok)──────────    │                     │                  │
    │                    │                      │                     │                  │
    │                    │ assertMember()        │                     │                  │
    │                    │─────────────────────>│                     │                  │
    │                    │                      │ SELECT member       │                  │
    │                    │                      │────────────────────>│                  │
    │                    │<────────────────────(ok)                   │                  │
    │                    │                      │                     │                  │
    │                    │ createMessage()       │                     │                  │
    │                    │─────────────────────>│                     │                  │
    │                    │                      │ BEGIN TX            │                  │
    │                    │                      │ UPDATE conv seq+1  │                  │
    │                    │                      │ INSERT message      │                  │
    │                    │                      │ COMMIT              │                  │
    │                    │                      │────────────────────>│                  │
    │                    │<──────────────────(message obj)            │                  │
    │                    │                      │                     │                  │
    │ callback(message)  │                      │                     │                  │
    │<───────────────────│                      │                     │                  │
    │                    │                      │                     │                  │
    │                    │ getMemberIds()        │                     │                  │
    │                    │─────────────────────>│                     │                  │
    │                    │<────────[A, B, C]────│                     │                  │
    │                    │                      │                     │                  │
    │                    │ For B: server.to('user:B').emit('new_message')                │
    │                    │──────────────────────────────────────────────────────────────>│
    │                    │ For C: server.to('user:C').emit('new_message')                │
    │                    │──────────────────────(C is offline, no-op)                    │
    │                    │                      │                     │                  │
```

### Sending across multiple servers (Redis adapter)

```
Server 1 (has User A)          Redis Pub/Sub          Server 2 (has User B)
        │                            │                          │
        │ server.to('user:B')        │                          │
        │ .emit('new_message', msg)  │                          │
        │                            │                          │
        │ [adapter] PUBLISH          │                          │
        │ ──────────────────────────>│                          │
        │                            │ [adapter] SUBSCRIBE      │
        │                            │ ────────────────────────>│
        │                            │                          │
        │                            │        Decode event      │
        │                            │        Find 'user:B'     │
        │                            │        room locally      │
        │                            │        Deliver to B's    │
        │                            │        socket            │
        │                            │                          │
```

---

## 7. Reconnection & Message Sync

### What happens when connection drops

```
Frontend:
  1. Socket.IO auto-reconnects (up to 10 attempts, 1s delay)
  2. On 'connect' event:
     a. Re-emit 'get_online_users' → refresh presence
     b. React Query refetches stale queries → conversations list refreshes
     c. If user was viewing a conversation → re-emit 'join_conversation'

Backend:
  1. handleConnection fires again with new socket ID
  2. New socket added to user:{userId} room
  3. Socket tracked in Redis: chat:user:{userId}:sockets
  4. If first socket → broadcast user_online

Gap handling:
  - Frontend calls REST API to fetch conversations → gets correct unread counts
  - Frontend calls REST API to fetch messages → gets any messages missed during disconnect
  - Sequence numbers (seqNumber) provide ordering guarantee
```

### Frontend reconnection hook

```typescript
// Already handled in use-socket-events.ts:
socket.on('connect', fetchOnlineUsers);

// Should also add:
socket.on('connect', () => {
  // Refetch conversations to catch up on missed messages
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
  // Re-join active conversation room if viewing one
  const activeConv = useChatStore.getState().activeConversationId;
  if (activeConv) {
    socket.emit('join_conversation', { conversationId: activeConv });
    queryClient.invalidateQueries({ queryKey: ['messages', activeConv] });
  }
});
```

---

## 8. Best Practices

### Avoid unnecessary broadcasts

```
DO:  Emit to user:{memberId} rooms (targeted delivery)
DON'T: server.emit('new_message', ...) to all connected clients

DO:  Use conversation:{id} room for ephemeral events (typing, read receipts)
DON'T: Send typing indicators to all members via user rooms

DO:  Skip sender in notification loop
DON'T: Send new_message back to the person who sent it
```

### Optimize performance

```
1. Batch member lookups
   - Cache getMemberIds() in Redis with short TTL (30s)
   - Invalidate on member add/remove

2. Fire-and-forget for notifications
   - notifyAllMembers() is async but NOT awaited (current: correct)
   - Message delivery to sender via callback is the priority

3. Minimize DB queries per message
   - Current: 1 assertMember + 1 transaction (2 queries) + 1 getMemberIds = 3 queries
   - Could combine assertMember into the transaction

4. Use Redis pipeline for multi-socket emit
   - smembers + multiple emits could use Redis pipeline
```

### Handle edge cases

```
1. Duplicate messages (network retry):
   - clientId unique constraint in DB → idempotent insert
   - Frontend dedup: check existing messages by id OR clientId

2. Stale socket IDs in Redis:
   - Socket IDs cleaned on disconnect
   - If server crashes: socket IDs become stale
   - Solution: TTL on user socket sets, or periodic cleanup

3. Race condition on room join:
   - User opens conversation → message arrives before join_conversation completes
   - Solution: user:{userId} room handles this — message still delivered
```

---

## 9. Suggested Improvements

### A. Presence tracking (current: good)

```
Current implementation:
  - Redis SET for online users: chat:online
  - Redis SET for socket IDs: chat:user:{userId}:sockets
  - Heartbeat refreshes presence TTL

Improvement:
  - Add last_active_conversation to presence data
  - Useful for "User is typing in..." indicators on conversation list
```

### B. Rate limiting (current: good)

```
Current: 10 messages per 5 seconds via Redis list
Improvement: Add per-conversation rate limits for group chats
```

### C. Message delivery guarantees

```
Current gap: If user:{B} room emit fails silently (Redis down),
             message is in DB but B doesn't get real-time notification.

Levels of guarantee:
  1. At-most-once  (current) — emit and forget, DB is backup
  2. At-least-once — store pending notifications, retry on reconnect
  3. Exactly-once  — sequence numbers + client-side dedup (partially implemented via clientId)

For most chat apps, level 1 + REST API catch-up on reconnect is sufficient.
Your seqNumber system already enables gap detection if needed.
```

### D. Redis member cache

```typescript
// Cache conversation member IDs with 30s TTL
async getMemberIdsCached(conversationId: string): Promise<string[]> {
  const key = `chat:members:${conversationId}`;
  const cached = await this.redis.smembers(key);
  if (cached.length > 0) return cached;

  const memberIds = await this.chatService.getMemberIds(conversationId);
  await this.redis.sadd(key, ...memberIds);
  await this.redis.expire(key, 30);
  return memberIds;
}

// Invalidate on member add/remove
async invalidateMemberCache(conversationId: string) {
  await this.redis.del(`chat:members:${conversationId}`);
}
```

---

## 10. Summary: Current vs Proposed

| Aspect | Current (broken) | Proposed (fixed) |
|--------|-----------------|------------------|
| **Room strategy** | Only `conversation:{id}` rooms | + `user:{userId}` personal rooms |
| **new_message routing** | `socket.to(conversation room)` | `server.to(user:{memberId})` for each member |
| **User not in conversation** | Misses messages | Receives via personal room |
| **Offline user** | No real-time (correct) | DB catch-up on reconnect (correct) |
| **edit/delete routing** | Room-only | Also via personal rooms |
| **Typing/read receipts** | Room-only | Room-only (correct — ephemeral) |
| **Reconnection** | No catch-up | Invalidate queries + re-join room |

### Implementation changes needed

```
Backend (chat.gateway.ts):
  1. handleConnection: add socket.join(`user:${userId}`)
  2. send_message: emit to user:{memberId} instead of conversation room
  3. edit_message: emit to user:{memberId} instead of conversation room
  4. delete_message (everyone): emit to user:{memberId} instead of conversation room

Frontend (use-socket-events.ts):
  5. On reconnect: invalidate conversations + re-join active conversation

No changes needed for:
  - typing (room-only is correct)
  - read receipts (room-only is correct)
  - reactions (room-only is acceptable)
  - presence (global broadcast is correct)
```
