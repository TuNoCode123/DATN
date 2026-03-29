# Chat & Friendship System - Full Specification

## Overview
Complete specification for the Chat & Friendship system. Covers database schema, REST endpoints, WebSocket events, request/response schemas, error codes, and **UI specification**.

**Base URL:** `http://localhost:4000/api`
**WebSocket URL:** `http://localhost:4000/chat`
**Auth:** All endpoints require `Authorization: Bearer <accessToken>` unless noted.

---

# 1. DATABASE SCHEMA

## Enums

```
FriendshipStatus: PENDING | ACCEPTED | BLOCKED
ConversationType: DIRECT | GROUP
MessageType:      TEXT | IMAGE | SYSTEM
MemberRole:       ADMIN | MEMBER
```

## Tables

### friendships
| Column | Type | Constraints |
|--------|------|-------------|
| id | String (cuid) | PK |
| requesterId | String | FK -> users.id, CASCADE |
| addresseeId | String | FK -> users.id, CASCADE |
| status | FriendshipStatus | default PENDING |
| createdAt | DateTime | default now() |
| updatedAt | DateTime | auto |
| | | UNIQUE(requesterId, addresseeId) |
| | | INDEX(addresseeId, status) |

### conversations
| Column | Type | Constraints |
|--------|------|-------------|
| id | String (cuid) | PK |
| type | ConversationType | default DIRECT |
| name | String? | null for DIRECT |
| avatarUrl | String? | |
| createdBy | String? | userId of creator |
| lastMessageSeq | Int | default 0 |
| directUserA | String? | sorted lower userId (null for GROUP) |
| directUserB | String? | sorted higher userId (null for GROUP) |
| createdAt | DateTime | default now() |
| updatedAt | DateTime | auto |
| | | UNIQUE(directUserA, directUserB) |
| | | INDEX(updatedAt) |

### conversation_members
| Column | Type | Constraints |
|--------|------|-------------|
| id | String (cuid) | PK |
| conversationId | String | FK -> conversations.id, CASCADE |
| userId | String | FK -> users.id, CASCADE |
| role | MemberRole | default MEMBER |
| lastReadSeq | Int | default 0 |
| joinedAt | DateTime | default now() |
| | | UNIQUE(conversationId, userId) |
| | | INDEX(userId) |

### messages
| Column | Type | Constraints |
|--------|------|-------------|
| id | String (cuid) | PK |
| conversationId | String | FK -> conversations.id, CASCADE |
| senderId | String | FK -> users.id, CASCADE |
| type | MessageType | default TEXT |
| content | String | |
| clientId | String? | client-generated UUID |
| seqNumber | Int | sequential per conversation |
| createdAt | DateTime | default now() |
| | | UNIQUE(conversationId, clientId) |
| | | UNIQUE(conversationId, seqNumber) |
| | | INDEX(conversationId, id) |

### Unread calculation
```
unread = conversation.lastMessageSeq - conversationMember.lastReadSeq
```
No COUNT query. Pure integer subtraction.

---

# 2. FRIENDSHIP REST API

All endpoints: `@UseGuards(JwtAuthGuard)` — requires valid JWT.

---

## 2.1 POST /api/friendships/request

Send a friend request.

**Request Body:**
```json
{
  "addresseeId": "clxyz..."
}
```

**Validations:**
- addresseeId must not equal current user (no self-friend)
- No existing friendship row (PENDING, ACCEPTED, or BLOCKED) in either direction
- addresseeId must be a valid, active user

**Success Response:** `201 Created`
```json
{
  "id": "clxyz...",
  "requesterId": "cl_current_user",
  "addresseeId": "cl_target_user",
  "status": "PENDING",
  "createdAt": "2026-03-26T10:00:00.000Z"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | SELF_REQUEST | Cannot send request to yourself |
| 404 | USER_NOT_FOUND | Target user does not exist |
| 409 | ALREADY_EXISTS | Friendship already exists (any status) |

---

## 2.2 PATCH /api/friendships/:id/respond

Accept or reject a pending friend request.

**Request Body:**
```json
{
  "action": "accept" | "reject"
}
```

**Validations:**
- Only the addressee can respond
- Friendship must be in PENDING status

**Behavior:**
- `accept`: Sets status to ACCEPTED
- `reject`: Hard-deletes the friendship row

**Success Response:** `200 OK`
```json
{
  "id": "clxyz...",
  "status": "ACCEPTED",
  "requester": { "id": "...", "displayName": "...", "avatarUrl": "..." },
  "addressee": { "id": "...", "displayName": "...", "avatarUrl": "..." }
}
```
For reject: `200 OK` with `{ "message": "Friend request rejected" }`

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | NOT_ADDRESSEE | Only addressee can respond |
| 404 | NOT_FOUND | Friendship not found |
| 409 | NOT_PENDING | Friendship is not in PENDING status |

---

## 2.3 DELETE /api/friendships/:id

Remove a friendship (unfriend).

**Validations:**
- Current user must be either requester or addressee
- Friendship must be in ACCEPTED status

**Behavior:** Hard-deletes the friendship row.

**Success Response:** `200 OK`
```json
{ "message": "Friendship removed" }
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | FORBIDDEN | User is not part of this friendship |
| 404 | NOT_FOUND | Friendship not found |

---

## 2.4 POST /api/friendships/:id/block

Block a user.

**Validations:**
- Current user must be part of the friendship
- Friendship must not already be BLOCKED

**Behavior:** Sets status to BLOCKED. Only the blocker (current user becomes requester) can unblock.

**Success Response:** `200 OK`
```json
{
  "id": "clxyz...",
  "status": "BLOCKED"
}
```

---

## 2.5 DELETE /api/friendships/:id/block

Unblock a user.

**Validations:**
- Current user must be the one who blocked (requester of the BLOCKED row)

**Behavior:** Hard-deletes the friendship row (returns to strangers).

**Success Response:** `200 OK`
```json
{ "message": "User unblocked" }
```

---

## 2.6 GET /api/friendships

List accepted friends.

**Query Params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page |
| search | string | - | Search by displayName |

**Success Response:** `200 OK`
```json
{
  "data": [
    {
      "friendshipId": "clxyz...",
      "user": {
        "id": "cl_friend_id",
        "displayName": "John Doe",
        "avatarUrl": "https://...",
        "email": "john@example.com"
      },
      "since": "2026-03-20T10:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

## 2.7 GET /api/friendships/requests

List pending friend requests.

**Query Params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | yes | `sent` or `received` |

**Success Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "clxyz...",
      "user": {
        "id": "...",
        "displayName": "Jane Smith",
        "avatarUrl": "https://..."
      },
      "createdAt": "2026-03-25T10:00:00.000Z"
    }
  ]
}
```
- `type=sent`: returns addressees (people you sent requests to)
- `type=received`: returns requesters (people who sent you requests)

---

## 2.8 GET /api/friendships/status/:userId

Get friendship status with a specific user.

**Success Response:** `200 OK`
```json
{
  "status": "none" | "pending_sent" | "pending_received" | "accepted" | "blocked",
  "friendshipId": "clxyz..." | null
}
```

---

# 3. CHAT REST API

All endpoints: `@UseGuards(JwtAuthGuard)` — requires valid JWT.

---

## 3.1 POST /api/chat/conversations

Create a new conversation.

**Request Body (DIRECT):**
```json
{
  "type": "DIRECT",
  "memberId": "cl_target_user_id"
}
```

**Request Body (GROUP):**
```json
{
  "type": "GROUP",
  "name": "Study Group",
  "memberIds": ["cl_user1", "cl_user2", "cl_user3"]
}
```

**DIRECT behavior:**
1. Sort IDs: `[userA, userB] = [currentUser, memberId].sort()`
2. Upsert with `directUserA`/`directUserB` unique constraint
3. If exists, return existing conversation
4. If new, create with both users as MEMBER

**GROUP behavior:**
1. Create conversation with name
2. Add current user as ADMIN, others as MEMBER
3. Minimum 2 members (including creator)

**Success Response:** `201 Created` (new) or `200 OK` (existing DIRECT)
```json
{
  "id": "clxyz...",
  "type": "DIRECT",
  "name": null,
  "members": [
    {
      "id": "cl_member_id",
      "userId": "cl_user1",
      "role": "MEMBER",
      "user": { "id": "...", "displayName": "...", "avatarUrl": "..." }
    }
  ],
  "createdAt": "2026-03-26T10:00:00.000Z"
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_TYPE | Invalid conversation type |
| 400 | SELF_CONVERSATION | Cannot create DIRECT with yourself |
| 400 | MIN_MEMBERS | GROUP requires at least 2 members |
| 404 | USER_NOT_FOUND | One or more member IDs invalid |

---

## 3.2 GET /api/chat/conversations

List user's conversations.

**Query Params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page |

**Success Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "clxyz...",
      "type": "DIRECT",
      "name": null,
      "avatarUrl": null,
      "lastMessageSeq": 47,
      "updatedAt": "2026-03-26T12:00:00.000Z",
      "unreadCount": 3,
      "lastMessage": {
        "id": "cl_msg...",
        "content": "Hello!",
        "type": "TEXT",
        "senderId": "cl_user...",
        "senderName": "John",
        "createdAt": "2026-03-26T12:00:00.000Z"
      },
      "members": [
        {
          "userId": "cl_user...",
          "displayName": "John Doe",
          "avatarUrl": "https://..."
        }
      ]
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 20
}
```

**Notes:**
- `unreadCount` = `lastMessageSeq - currentUserMember.lastReadSeq` (computed in query)
- Ordered by `updatedAt DESC` (most recent conversation first)
- For DIRECT: `members` array excludes the current user (shows the other person)
- For GROUP: `members` shows all members
- `lastMessage` is null if conversation has no messages

---

## 3.3 GET /api/chat/conversations/:id

Get conversation detail.

**Validations:** Current user must be a member.

**Success Response:** `200 OK`
```json
{
  "id": "clxyz...",
  "type": "GROUP",
  "name": "Study Group",
  "avatarUrl": null,
  "createdBy": "cl_user...",
  "lastMessageSeq": 120,
  "createdAt": "2026-03-20T10:00:00.000Z",
  "members": [
    {
      "id": "cl_member...",
      "userId": "cl_user...",
      "role": "ADMIN",
      "lastReadSeq": 118,
      "joinedAt": "2026-03-20T10:00:00.000Z",
      "user": { "id": "...", "displayName": "...", "avatarUrl": "..." }
    }
  ]
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | NOT_MEMBER | User is not a member of this conversation |
| 404 | NOT_FOUND | Conversation does not exist |

---

## 3.4 GET /api/chat/conversations/:id/messages

Get messages with cursor-based pagination.

**Query Params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | number | 30 | Messages per page (max 50) |
| before | string | - | Message ID cursor (load older messages before this ID) |

**Validations:** Current user must be a member.

**Success Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "cl_msg_newest",
      "conversationId": "clxyz...",
      "senderId": "cl_user...",
      "type": "TEXT",
      "content": "Latest message",
      "seqNumber": 120,
      "createdAt": "2026-03-26T12:00:00.000Z",
      "sender": {
        "id": "cl_user...",
        "displayName": "John Doe",
        "avatarUrl": "https://..."
      }
    }
  ],
  "hasMore": true
}
```

**Notes:**
- Messages ordered by `id DESC` (newest first)
- `before` param: `WHERE conversationId = :id AND id < :before ORDER BY id DESC LIMIT :limit`
- If `before` is omitted, returns the latest messages
- `hasMore`: true if there are older messages beyond this page
- Uses `@@index([conversationId, id])` for efficient cursor queries

---

## 3.5 PATCH /api/chat/conversations/:id

Update group conversation.

**Request Body:**
```json
{
  "name": "New Group Name",
  "avatarUrl": "https://..."
}
```

**Validations:**
- Conversation must be type GROUP
- Current user must have role ADMIN in this conversation

**Success Response:** `200 OK`
```json
{
  "id": "clxyz...",
  "name": "New Group Name",
  "avatarUrl": "https://..."
}
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | NOT_ADMIN | Only group admins can update |
| 400 | NOT_GROUP | Cannot update DIRECT conversations |

---

## 3.6 POST /api/chat/conversations/:id/members

Add members to a group conversation.

**Request Body:**
```json
{
  "userIds": ["cl_user1", "cl_user2"]
}
```

**Validations:**
- Conversation must be type GROUP
- Current user must have role ADMIN
- Users must exist and not already be members

**Success Response:** `201 Created`
```json
{
  "added": [
    { "userId": "cl_user1", "displayName": "Jane" },
    { "userId": "cl_user2", "displayName": "Bob" }
  ]
}
```

---

## 3.7 DELETE /api/chat/conversations/:id/members/:userId

Remove a member from group, or leave the group.

**Behavior:**
- If `:userId` == current user: **leave** the group (any role)
- If `:userId` != current user: **remove** the member (ADMIN only)
- If last member leaves: delete the conversation

**Success Response:** `200 OK`
```json
{ "message": "Member removed" }
```

**Errors:**
| Status | Code | Condition |
|--------|------|-----------|
| 403 | NOT_ADMIN | Only admins can remove other members |
| 400 | NOT_GROUP | Cannot remove members from DIRECT conversations |

---

## 3.8 PATCH /api/chat/conversations/:id/read

Mark conversation as read.

**Request Body:**
```json
{
  "seqNumber": 47
}
```

**Behavior:** Updates `conversationMember.lastReadSeq = seqNumber` for current user.

**Validations:**
- seqNumber must be <= conversation.lastMessageSeq (cannot mark future messages)
- seqNumber must be >= current lastReadSeq (cannot go backwards)

**Success Response:** `200 OK`
```json
{ "lastReadSeq": 47 }
```

---

# 4. WEBSOCKET SPECIFICATION

## Connection

**URL:** `ws://localhost:4000/chat`
**Transport:** Socket.io (WebSocket with polling fallback)

**Authentication:**
```javascript
const socket = io('http://localhost:4000/chat', {
  auth: { token: '<accessToken>' }
});
```

**Server-side on connect:**
1. Extract token from `socket.handshake.auth.token`
2. Verify JWT with JwtService
3. On invalid/expired: emit `auth_error`, disconnect
4. On valid: store user in `socket.data.user = { id, email, role }`
5. Register in presence map
6. Client must explicitly join rooms via `join_conversation`

---

## 4.1 Client -> Server Events

### send_message

Send a message to a conversation.

**Payload:**
```json
{
  "conversationId": "clxyz...",
  "content": "Hello world",
  "type": "TEXT",
  "clientId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| conversationId | string | yes | Target conversation |
| content | string | yes | Message content |
| type | MessageType | no | Default: TEXT |
| clientId | string | yes | Client-generated UUID v4 for idempotency |

**Server processing:**
1. Check rate limit (10 msgs / 5 sec)
2. Validate sender is member of conversation
3. Transaction: increment `conversation.lastMessageSeq`, insert message
4. On clientId duplicate: return existing message (idempotent)
5. Broadcast `new_message` to room (excluding sender)
6. Send ack callback to sender with saved message

**Acknowledgement callback:**
```json
{
  "success": true,
  "message": {
    "id": "cl_msg...",
    "conversationId": "clxyz...",
    "senderId": "cl_user...",
    "content": "Hello world",
    "type": "TEXT",
    "seqNumber": 48,
    "createdAt": "2026-03-26T12:00:00.000Z",
    "sender": { "id": "...", "displayName": "...", "avatarUrl": "..." }
  }
}
```

**Error callback:**
```json
{
  "success": false,
  "error": "NOT_MEMBER" | "RATE_LIMITED" | "VALIDATION_ERROR"
}
```

---

### join_conversation

Join a conversation's Socket.io room to receive real-time events.

**Payload:**
```json
{
  "conversationId": "clxyz..."
}
```

**Server processing:**
1. Validate user is member of conversation
2. `socket.join('conversation:clxyz...')`

**Acknowledgement:** `{ "success": true }`

---

### leave_conversation

Leave a conversation's Socket.io room. Does NOT remove from DB.

**Payload:**
```json
{
  "conversationId": "clxyz..."
}
```

**Server processing:** `socket.leave('conversation:clxyz...')`

---

### mark_read

Mark messages as read up to a sequence number.

**Payload:**
```json
{
  "conversationId": "clxyz...",
  "seqNumber": 47
}
```

**Server processing:**
1. Update `conversationMember.lastReadSeq = seqNumber`
2. Broadcast `message_read` to room

---

### typing_start

Indicate user started typing.

**Payload:**
```json
{
  "conversationId": "clxyz..."
}
```

**Server processing:**
1. Set/reset 5-second TTL timeout for this user+conversation
2. Broadcast `user_typing` to room (excluding sender)

---

### typing_stop

Indicate user stopped typing.

**Payload:**
```json
{
  "conversationId": "clxyz..."
}
```

**Server processing:**
1. Clear TTL timeout
2. Broadcast `user_stop_typing` to room (excluding sender)

---

## 4.2 Server -> Client Events

### new_message

A new message was sent in a joined conversation.

**Payload:**
```json
{
  "id": "cl_msg...",
  "conversationId": "clxyz...",
  "senderId": "cl_user...",
  "content": "Hello!",
  "type": "TEXT",
  "seqNumber": 48,
  "createdAt": "2026-03-26T12:00:00.000Z",
  "sender": {
    "id": "cl_user...",
    "displayName": "John Doe",
    "avatarUrl": "https://..."
  }
}
```

**Note:** NOT sent to the message sender (uses `socket.to(room)`). Sender gets the message via ack callback.

---

### message_read

A user marked messages as read.

**Payload:**
```json
{
  "conversationId": "clxyz...",
  "userId": "cl_user...",
  "lastReadSeq": 47
}
```

---

### user_typing

A user started typing in a conversation.

**Payload:**
```json
{
  "conversationId": "clxyz...",
  "userId": "cl_user...",
  "displayName": "John Doe"
}
```

---

### user_stop_typing

A user stopped typing (explicit or TTL expired or disconnected).

**Payload:**
```json
{
  "conversationId": "clxyz...",
  "userId": "cl_user..."
}
```

---

### user_online

A user came online (first socket connected).

**Payload:**
```json
{
  "userId": "cl_user..."
}
```

---

### user_offline

A user went offline (last socket disconnected).

**Payload:**
```json
{
  "userId": "cl_user...",
  "lastSeen": "2026-03-26T12:00:00.000Z"
}
```

---

### auth_error

JWT token is invalid or expired.

**Payload:**
```json
{
  "message": "Token expired"
}
```

**Client action:** Disconnect, refresh token, reconnect.

---

## 4.3 Room Strategy

| Room Name | Format | Purpose |
|-----------|--------|---------|
| Conversation room | `conversation:{conversationId}` | Message delivery, typing, read receipts |

- Client joins rooms explicitly via `join_conversation`
- Client leaves rooms via `leave_conversation` or on disconnect (auto)
- Socket.io auto-cleans rooms on disconnect

---

# 5. DATA FLOWS

## 5.1 Send Message (complete flow)

```
Client                          Server                          Database
  |                               |                               |
  |-- send_message ------------->|                               |
  |   { convId, content,        |-- check rate limit            |
  |     clientId }               |-- validate membership ------->|-- SELECT member
  |                               |                               |<- member found
  |                               |-- createMessage() ---------->|-- BEGIN TX
  |                               |                               |   UPDATE conv.lastMessageSeq++
  |                               |                               |   INSERT message
  |                               |                               |   ON CONFLICT(clientId) -> SELECT
  |                               |                               |-- COMMIT
  |                               |<- savedMessage               |
  |<- ack(savedMessage)          |                               |
  |                               |-- socket.to(room).emit       |
  |                               |   'new_message' ------------>| (to other members in room)
```

## 5.2 Create DIRECT Conversation (race-safe)

```
Client A (concurrent)           Server                          Database
Client B (concurrent)             |                               |
  |-- POST /conversations ------>|                               |
  |   { type: DIRECT,           |-- sort IDs                    |
  |     memberId }               |-- upsert ------------------->|-- INSERT ... ON CONFLICT DO NOTHING
  |                               |                               |   (directUserA, directUserB unique)
  |                               |<- conversation               |
  |<- 200/201 conversation       |                               |
```
Both clients get the same conversation. DB constraint prevents duplicates.

## 5.3 Unread Count (no extra query)

```
List Conversations Query:
  SELECT c.*, cm.lastReadSeq,
         (c.lastMessageSeq - cm.lastReadSeq) AS unreadCount
  FROM conversations c
  JOIN conversation_members cm ON cm.conversationId = c.id
  WHERE cm.userId = :currentUser
  ORDER BY c.updatedAt DESC
```
Single query. Unread is computed inline.

## 5.4 Typing Indicator (with TTL)

```
Client A                        Server                          Client B
  |                               |                               |
  |-- typing_start ------------->|                               |
  |   { conversationId }         |-- set 5s timeout              |
  |                               |-- socket.to(room).emit ----->|-- user_typing
  |                               |   (excl sender)              |   { userId, displayName }
  |                               |                               |
  | (5 seconds, no typing_stop)  |                               |
  |                               |-- timeout fires              |
  |                               |-- socket.to(room).emit ----->|-- user_stop_typing
  |                               |                               |   { userId }
```

## 5.5 Presence (connect/disconnect)

```
Client                          Server
  |                               |
  |-- connect (JWT) ----------->|-- verify JWT
  |                               |-- add to presenceMap[userId].add(socketId)
  |                               |-- if first socket: broadcast 'user_online'
  |                               |
  |-- disconnect --------------->|-- remove from presenceMap[userId].delete(socketId)
  |                               |-- if set empty:
  |                               |     clear typing timeouts
  |                               |     broadcast 'user_offline' + lastSeen
```

---

# 6. ERROR CODES

## REST errors
| HTTP | Code | Description |
|------|------|-------------|
| 400 | SELF_REQUEST | Cannot send friend request to yourself |
| 400 | SELF_CONVERSATION | Cannot create DIRECT conversation with yourself |
| 400 | INVALID_TYPE | Invalid conversation type |
| 400 | MIN_MEMBERS | GROUP requires at least 2 members |
| 400 | NOT_GROUP | Operation only valid for GROUP conversations |
| 403 | FORBIDDEN | User not authorized for this action |
| 403 | NOT_ADDRESSEE | Only addressee can respond to request |
| 403 | NOT_MEMBER | User is not a member of conversation |
| 403 | NOT_ADMIN | Only group admins can perform this action |
| 404 | NOT_FOUND | Resource not found |
| 404 | USER_NOT_FOUND | User does not exist |
| 409 | ALREADY_EXISTS | Friendship already exists |
| 409 | NOT_PENDING | Friendship is not in PENDING status |

## WebSocket errors (via ack callback or 'error' event)
| Code | Description |
|------|-------------|
| NOT_MEMBER | User not in conversation |
| RATE_LIMITED | Too many messages (>10 per 5 sec) |
| VALIDATION_ERROR | Invalid payload |
| AUTH_ERROR | Invalid/expired JWT |

---

# 7. RATE LIMITS

| Action | Limit | Window | Enforcement |
|--------|-------|--------|-------------|
| send_message (WS) | 10 messages | 5 seconds | In-memory per userId |

---

# 8. PERFORMANCE NOTES

1. **1 message = 1 DB insert** — no per-user message records, room broadcast instead
2. **Unread = integer subtraction** — `lastMessageSeq - lastReadSeq`, computed inline in list query
3. **Cursor pagination** — `WHERE id < cursor`, backed by `@@index([conversationId, id])`
4. **DIRECT dedup** — DB-level unique constraint, zero race conditions
5. **Idempotent sends** — `clientId` unique constraint, safe retries
6. **Typing: no DB writes** — in-memory only, auto-expires via TTL
7. **Presence: in-memory** — `Map<userId, Set<socketId>>`, no DB/Redis needed for single server
8. **Sender excluded from broadcast** — `socket.to(room)` instead of `server.to(room)`, reduces traffic

---

# 9. UI SPECIFICATION

## 9.1 Routes

| Route | Page | Description |
|-------|------|-------------|
| `/chat` | Chat Page | Main chat interface (conversation list + message area) |
| `/friends` | Friends Page | Friends management (list, requests, search users) |

Both pages live inside the `(learner)` route group and inherit the Navbar + Footer layout.

---

## 9.2 Chat Page (`/chat`)

### Overall Layout

```
+------------------------------------------------------------------+
|  Navbar (existing)                                                |
+------------------------------------------------------------------+
|                                                                    |
|  +------------------+  +--------------------------------------+   |
|  |  SIDEBAR (320px) |  |  MESSAGE AREA (flex-1)               |   |
|  |                  |  |                                      |   |
|  |  [Search box]    |  |  [Conversation Header]               |   |
|  |                  |  |  +---------------------------------+ |   |
|  |  [New Group btn] |  |  |                                 | |   |
|  |                  |  |  |  Messages (scroll, oldest top)   | |   |
|  |  +-----------+   |  |  |                                 | |   |
|  |  | Conv Item |   |  |  |  [date separator]               | |   |
|  |  | Conv Item |   |  |  |  [bubble left]  [bubble right]  | |   |
|  |  | Conv Item |<---->|  |  [bubble left]  [bubble right]  | |   |
|  |  | Conv Item |   |  |  |                                 | |   |
|  |  | (active)  |   |  |  |  [typing indicator]             | |   |
|  |  | Conv Item |   |  |  +---------------------------------+ |   |
|  |  +-----------+   |  |                                      |   |
|  |                  |  |  [Message Input Bar]                 |   |
|  +------------------+  +--------------------------------------+   |
|                                                                    |
+------------------------------------------------------------------+
|  Footer (existing)                                                |
+------------------------------------------------------------------+
```

**Responsive behavior:**
- Desktop (>= 768px): Side-by-side layout. Sidebar always visible.
- Mobile (< 768px): Full-screen toggle. Show sidebar OR message area, not both. Back arrow in message header to return to sidebar.

---

### 9.2.1 Conversation Sidebar

**Component:** `conversation-list.tsx`

```
+------------------------+
| [Search icon] Search.. |  <- Input with Search icon (lucide)
+------------------------+
| [+ New Group]          |  <- Button, opens CreateGroupModal
+------------------------+
|                        |
| +--------------------+ |
| | [Avatar] [Online]  | |  <- 40px avatar + 8px green dot (online) or gray (offline)
| | John Doe       2m  | |  <- displayName + time ago (right-aligned, text-muted)
| | Hello, how are y.. | |  <- lastMessage.content truncated to 1 line
| | [3]                 | |  <- unread badge (blue circle, only if unreadCount > 0)
| +--------------------+ |
|                        |
| +--------------------+ |
| | [GroupAvatar]       | |  <- For GROUP: show stacked avatars or group icon
| | Study Group    1h   | |
| | Alice: Check th..  | |  <- For GROUP: prefix with sender name
| +--------------------+ |
|                        |
+------------------------+
```

**Conversation Item states:**
| State | Style |
|-------|-------|
| Default | `bg-white` |
| Active (selected) | `bg-primary/10 border-l-2 border-primary` |
| Has unread | `font-semibold` on name + message, unread badge visible |
| Hover | `bg-muted/50` |

**Search behavior:**
- Filters conversations by member name or group name
- Client-side filter on the loaded conversations list
- Debounced input (300ms)

**Data source:** `useQuery(['conversations'])` -> `GET /api/chat/conversations`

---

### 9.2.2 Conversation Header

**Component:** `message-area.tsx` (top section)

**DIRECT conversation:**
```
+----------------------------------------------------------+
| [<- back] [Avatar][Online dot] John Doe                  |
|                                 Online / Last seen 2h ago |
+----------------------------------------------------------+
```

**GROUP conversation:**
```
+----------------------------------------------------------+
| [<- back] [GroupIcon] Study Group                  [ℹ️]  |
|                       3 members, 2 online                 |
+----------------------------------------------------------+
```

| Element | Description |
|---------|-------------|
| Back arrow | Mobile only. Returns to sidebar view. Icon: `ArrowLeft` (lucide) |
| Avatar | 36px, user's avatarUrl or initials fallback |
| Online dot | 10px circle, `bg-green-500` if online, `bg-gray-300` if offline |
| Name | `text-lg font-semibold` |
| Subtitle | "Online" / "Last seen X ago" for DIRECT. "N members, M online" for GROUP |
| Info button | GROUP only. Opens group info drawer (Sheet from right side) |

---

### 9.2.3 Message Area

**Component:** `message-area.tsx` (center scrollable section)

**Layout:** Scrollable container, messages flow top (oldest) to bottom (newest). Auto-scroll to bottom on new messages (only if user is already at bottom).

**Date Separator:**
```
         ── March 26, 2026 ──
```
- Shown between messages from different days
- `text-xs text-muted-foreground` centered with horizontal lines

**Message Bubble (other user — left aligned):**
```
[Avatar]  +---------------------------+
          | Hello, how are you?       |
          +---------------------------+
          10:30 AM
```

**Message Bubble (current user — right aligned):**
```
          +---------------------------+  [Avatar]
          | I'm doing great, thanks!  |
          +---------------------------+
                              10:31 AM  ✓✓
```

| Element | Style |
|---------|-------|
| Other user bubble | `bg-muted` rounded-lg rounded-tl-none, left-aligned |
| Current user bubble | `bg-primary text-primary-foreground` rounded-lg rounded-tr-none, right-aligned |
| Avatar | 32px, only shown on first message in a consecutive group from same sender |
| Sender name | Shown above bubble in GROUP conversations only (not DIRECT). `text-xs font-medium text-muted-foreground` |
| Timestamp | `text-[10px] text-muted-foreground` below bubble |
| Read receipt | `✓` sent, `✓✓` read (based on other user's lastReadSeq >= message.seqNumber). Only on current user's messages |
| Pending message | `opacity-60` until ack received from server |
| Failed message | Red `!` icon + "Tap to retry" text |

**Message grouping:**
- Consecutive messages from the same sender within 2 minutes are grouped
- Only the first message in a group shows avatar + sender name
- Only the last message in a group shows timestamp

**Scroll behavior:**
- Initial load: scroll to bottom (latest messages)
- New message arrives + user is at bottom: auto-scroll to bottom
- New message arrives + user has scrolled up: show "New messages" pill at bottom, do NOT auto-scroll
- Scroll to top: trigger `fetchNextPage()` (load older messages via cursor pagination)
- Show spinner at top while loading older messages

**Typing indicator (at bottom of message list):**
```
[Avatar] ● ● ●  John is typing...
```
- Shown below the last message, above the input bar
- Animated dots (CSS animation, 3 bouncing dots)
- For GROUP: "John is typing..." or "John, Alice are typing..."
- Disappears when `user_stop_typing` received or TTL expires (client-side 6s safety)

**Data source:** `useInfiniteQuery(['messages', conversationId])` -> `GET /api/chat/conversations/:id/messages`

---

### 9.2.4 Message Input Bar

**Component:** `message-input.tsx`

```
+----------------------------------------------------------+
| [📎]  Type a message...                         [Send ➤] |
+----------------------------------------------------------+
```

| Element | Description |
|---------|-------------|
| Attachment button | Icon: `Paperclip` (lucide). Future: opens file picker for IMAGE type |
| Text input | `<textarea>` auto-resizing (1 row min, 5 rows max). Placeholder: "Type a message..." |
| Send button | Icon: `SendHorizonal` (lucide). Disabled when input is empty. `bg-primary text-white` rounded-full |

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Shift + Enter` | New line |
| `Escape` | Clear input (if in reply context) |

**Typing events:**
- On input change (debounced 300ms): emit `typing_start`
- On 3 seconds of no input: emit `typing_stop`
- On send message: emit `typing_stop`

**Send flow:**
1. Generate `clientId = crypto.randomUUID()`
2. Add optimistic message to React Query cache (pending state)
3. Clear input immediately
4. `socket.emit('send_message', payload, ackCallback)`
5. On ack: replace optimistic message with confirmed message
6. On 5s timeout / error: mark as failed, show retry

---

### 9.2.5 Create Group Modal

**Component:** `create-group-modal.tsx`
**Trigger:** "New Group" button in sidebar

Uses Radix UI `Dialog` (existing `/components/ui/dialog.tsx` pattern).

```
+--------------------------------------+
|  Create Group                     [X] |
+--------------------------------------+
|                                       |
|  Group Name                           |
|  +----------------------------------+|
|  | Enter group name...              ||
|  +----------------------------------+|
|                                       |
|  Add Members                          |
|  +----------------------------------+|
|  | [Search icon] Search friends...  ||
|  +----------------------------------+|
|                                       |
|  +----------------------------------+|
|  | [Avatar] John Doe         [Add]  ||
|  | [Avatar] Jane Smith       [Add]  ||
|  | [Avatar] Bob Wilson    [Added ✓] ||
|  +----------------------------------+|
|                                       |
|  Selected (2):                        |
|  [Bob Wilson ✕] [Jane Smith ✕]       |
|                                       |
|  [Cancel]              [Create Group] |
+--------------------------------------+
```

| Element | Description |
|---------|-------------|
| Group Name input | Required. Min 2 chars |
| Search input | Searches from friends list (`GET /api/friendships`) |
| Friend list | Scrollable list of accepted friends. Shows avatar + name + Add/Added toggle |
| Selected chips | Removable tags showing selected members |
| Create button | Disabled until name + at least 1 member selected. Calls `POST /api/chat/conversations` with type GROUP |

---

### 9.2.6 Group Info Drawer

**Component:** `group-info-drawer.tsx`
**Trigger:** Info button (ℹ️) in conversation header for GROUP conversations.

Uses Radix UI `Sheet` (existing pattern), slides from right.

```
+-------------------------------+
|  Group Info               [X] |
+-------------------------------+
|                               |
|  [GroupAvatar]                |
|  Study Group          [Edit] |
|  Created Mar 20, 2026        |
|                               |
|  Members (5)          [Add+] |
|  +---------------------------+|
|  | [Avatar] You      ADMIN  ||
|  | [Avatar] John     MEMBER ||
|  | [Avatar] Jane     MEMBER ||
|  |   ...                     ||
|  +---------------------------+|
|                               |
|  [Leave Group]               |
+-------------------------------+
```

| Element | Description |
|---------|-------------|
| Edit button | ADMIN only. Inline edit for group name |
| Add button | ADMIN only. Opens member search (same as create group) |
| Member list | Shows role badge. ADMIN can click member -> dropdown: "Remove from group" |
| Leave button | `text-red-500`. Confirms with dialog before leaving |

---

### 9.2.7 Empty State (no conversation selected)

When no conversation is active (desktop only, right panel):

```
+--------------------------------------+
|                                      |
|          [MessageSquare icon]        |
|                                      |
|       Select a conversation          |
|    or start a new one to begin       |
|              chatting                |
|                                      |
+--------------------------------------+
```

Uses existing empty state pattern: centered icon + text.

---

## 9.3 Friends Page (`/friends`)

### Overall Layout

```
+------------------------------------------------------------------+
|  Navbar (existing)                                                |
+------------------------------------------------------------------+
|                                                                    |
|  Friends                                         [Find Friends]   |
|                                                                    |
|  +-------------------+-------------------+                        |
|  | My Friends (42)   | Requests (3)      |  <- Tabs              |
|  +-------------------+-------------------+                        |
|                                                                    |
|  [Search icon] Search friends...                                  |
|                                                                    |
|  +--------------------------------------------------------------+ |
|  |  [Friend Card]  [Friend Card]  [Friend Card]                | |
|  |  [Friend Card]  [Friend Card]  [Friend Card]                | |
|  |  ...                                                         | |
|  +--------------------------------------------------------------+ |
|                                                                    |
+------------------------------------------------------------------+
|  Footer (existing)                                                |
+------------------------------------------------------------------+
```

Uses Radix UI `Tabs` (existing pattern).

---

### 9.3.1 My Friends Tab

**Component:** `friends-list.tsx`

Grid layout: 1 col mobile, 2 cols tablet, 3 cols desktop.

**Friend Card:**
```
+------------------------------------+
| [Avatar 48px] [Online dot]        |
| John Doe                           |
| john@example.com                   |
|                                    |
| [Message]            [Unfriend ✕] |
+------------------------------------+
```

| Element | Description |
|---------|-------------|
| Avatar | 48px with online/offline dot |
| Name | `text-base font-semibold` |
| Email | `text-sm text-muted-foreground` |
| Message button | `variant="outline"`. Creates/opens DIRECT conversation, navigates to `/chat` |
| Unfriend button | `variant="ghost"` red text. Shows ConfirmDialog before unfriending |

**Data source:** `useQuery(['friends'])` -> `GET /api/friendships`

---

### 9.3.2 Requests Tab

**Component:** `friend-requests.tsx`

Two sub-sections: "Received" and "Sent".

**Received Request Card:**
```
+------------------------------------+
| [Avatar] Jane Smith                |
| Sent 2 hours ago                   |
|                                    |
| [Accept ✓]           [Reject ✕]  |
+------------------------------------+
```

**Sent Request Card:**
```
+------------------------------------+
| [Avatar] Bob Wilson                |
| Sent 1 day ago                     |
|                                    |
|                      [Cancel ✕]   |
+------------------------------------+
```

| Element | Description |
|---------|-------------|
| Accept button | `variant="default"` (primary). Calls `PATCH /api/friendships/:id/respond` with `accept` |
| Reject button | `variant="outline"`. Calls `PATCH /api/friendships/:id/respond` with `reject` |
| Cancel button | `variant="ghost"` red. Calls `DELETE /api/friendships/:id` |

**Data source:**
- `useQuery(['friend-requests', 'received'])` -> `GET /api/friendships/requests?type=received`
- `useQuery(['friend-requests', 'sent'])` -> `GET /api/friendships/requests?type=sent`

---

### 9.3.3 Find Friends Modal

**Component:** `user-search-modal.tsx`
**Trigger:** "Find Friends" button in page header.

Uses Radix UI `Dialog`.

```
+--------------------------------------+
|  Find Friends                     [X] |
+--------------------------------------+
|                                       |
|  +----------------------------------+|
|  | [Search] Search by name or email ||
|  +----------------------------------+|
|                                       |
|  +----------------------------------+|
|  | [Avatar] Alice Wong               |
|  | alice@example.com                 |
|  |                   [Add Friend ✓] ||
|  +----------------------------------+|
|  | [Avatar] David Lee                |
|  | david@example.com                 |
|  |                    [Pending ⏳]  ||
|  +----------------------------------+|
|  | [Avatar] Sarah Kim                |
|  | sarah@example.com                 |
|  |                    [Friends ✓]   ||
|  +----------------------------------+|
|                                       |
+--------------------------------------+
```

| Status | Button |
|--------|--------|
| No friendship | "Add Friend" - primary button. Calls `POST /api/friendships/request` |
| Pending (sent by me) | "Pending" - disabled outline button |
| Pending (sent to me) | "Accept" - primary button |
| Already friends | "Friends" - disabled success badge |
| Blocked | Not shown in results |

**Search:** Server-side search. Calls a user search endpoint (needs `GET /api/users/search?q=...` — new endpoint, returns users excluding current user).
**Debounce:** 500ms on input.

---

## 9.4 Navbar Updates

Add to existing Navbar links:

| Item | Icon | Route | Badge |
|------|------|-------|-------|
| Chat | `MessageSquare` (lucide) | `/chat` | Total unread count (sum of all conversation unreadCounts). Red circle badge. Hidden when 0. |
| Friends | `Users` (lucide) | `/friends` | Pending received requests count. Red circle badge. Hidden when 0. |

**Badge data source:**
- Chat unread: derived from conversations query (sum all unreadCounts)
- Friend requests: `useQuery(['friend-requests', 'received'])` with `select: data => data.length`

---

## 9.5 State Management

### Zustand (`chat-store.ts`) — UI-only ephemeral state
```typescript
interface ChatStore {
  // Active view
  activeConversationId: string | null
  setActiveConversation: (id: string | null) => void

  // Typing indicators (from WebSocket)
  typingUsers: Record<string, { userId: string; displayName: string }[]>
  setTyping: (convId: string, userId: string, name: string, isTyping: boolean) => void

  // Online presence (from WebSocket)
  onlineUsers: Set<string>
  setUserOnline: (userId: string, online: boolean) => void

  // Mobile view toggle
  showSidebar: boolean
  toggleSidebar: () => void
}
```

### React Query — all server-synced state

| Query Key | Endpoint | Usage |
|-----------|----------|-------|
| `['conversations']` | `GET /api/chat/conversations` | Conversation list + unread counts |
| `['messages', conversationId]` | `GET /api/chat/conversations/:id/messages` | Infinite query, cursor paginated |
| `['conversation', id]` | `GET /api/chat/conversations/:id` | Single conversation detail (members, roles) |
| `['friends']` | `GET /api/friendships` | Friends list |
| `['friend-requests', type]` | `GET /api/friendships/requests?type=` | Sent / received requests |
| `['friendship-status', userId]` | `GET /api/friendships/status/:userId` | Status check for user search |

### Socket event -> state update mapping

| Socket Event | React Query Update | Zustand Update |
|-------------|-------------------|----------------|
| `new_message` | `setQueryData(['messages', convId], append)` + `invalidateQueries(['conversations'])` | - |
| `message_read` | `invalidateQueries(['conversations'])` | - |
| `user_typing` | - | `setTyping(convId, userId, name, true)` |
| `user_stop_typing` | - | `setTyping(convId, userId, name, false)` |
| `user_online` | - | `setUserOnline(userId, true)` |
| `user_offline` | - | `setUserOnline(userId, false)` |

---

## 9.6 Component File Structure

```
apps/web/src/
  app/(learner)/
    chat/page.tsx                          # Chat page (client component)
    friends/page.tsx                       # Friends page (client component)

  components/
    chat/
      chat-layout.tsx                      # Split panel: sidebar + message area
      conversation-list.tsx                # Left sidebar with search + conversation items
      conversation-item.tsx                # Single conversation row
      message-area.tsx                     # Header + messages + input
      message-bubble.tsx                   # Single message (left/right aligned)
      message-input.tsx                    # Textarea + send button
      typing-indicator.tsx                 # Animated "X is typing..." dots
      create-group-modal.tsx               # Dialog for creating group conversation
      group-info-drawer.tsx                # Sheet for group details + members
      date-separator.tsx                   # "── March 26, 2026 ──" between days
      new-messages-pill.tsx                # "↓ New messages" floating pill

    friends/
      friends-list.tsx                     # Grid of friend cards
      friend-card.tsx                      # Single friend (avatar, name, actions)
      friend-requests.tsx                  # Received + sent request sections
      friend-request-card.tsx              # Single request (accept/reject/cancel)
      user-search-modal.tsx                # Dialog to search + add friends

  features/
    chat/
      hooks/
        use-chat.ts                        # React Query hooks for chat REST API
        use-socket-events.ts               # Socket event listener hook

    friendships/
      hooks/
        use-friendships.ts                 # React Query hooks for friendships REST API

  lib/
    socket.ts                              # Socket.io singleton (connect/disconnect/getSocket)
    chat-store.ts                          # Zustand store (UI-only state)
```

---

## 9.7 Loading & Error States

### Conversation List
- **Loading:** 5 skeleton rows (avatar circle + 2 text lines), using existing `Skeleton` component
- **Empty:** MessageSquare icon + "No conversations yet" + "Start chatting with your friends"
- **Error:** Red banner with retry button

### Message Area
- **Loading messages:** Spinner centered in message area
- **Loading older (scroll up):** Small spinner at top of message list
- **Empty conversation:** "No messages yet. Say hello!" centered
- **Connection lost:** Yellow banner at top: "Reconnecting..." with spinner

### Friends
- **Loading:** Grid of 6 skeleton cards (avatar + 2 text lines)
- **Empty friends:** Users icon + "No friends yet" + "Find friends to connect with"
- **Empty requests:** Inbox icon + "No pending requests"

---

## 9.8 Toast Notifications

Uses `sonner` (existing pattern in the project).

| Event | Toast |
|-------|-------|
| Friend request sent | `toast.success('Friend request sent')` |
| Friend request accepted | `toast.success('You are now friends with {name}')` |
| Friend request rejected | `toast.info('Friend request rejected')` |
| Unfriended | `toast.info('Removed {name} from friends')` |
| Group created | `toast.success('Group "{name}" created')` |
| Left group | `toast.info('You left "{name}"')` |
| Member added | `toast.success('{name} added to group')` |
| Member removed | `toast.info('{name} removed from group')` |
| Message send failed | `toast.error('Failed to send message. Tap to retry')` |
| Connection lost | `toast.warning('Connection lost. Reconnecting...')` |
| Connection restored | `toast.success('Connected')` |
| Rate limited | `toast.error('Slow down! Too many messages')` |

---

## 9.9 Additional API Needed

The UI spec requires one additional endpoint not in the original API spec:

### GET /api/users/search

Search users by name or email (for "Find Friends" modal).

**Query Params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| q | string | required | Search query (min 2 chars) |
| limit | number | 10 | Max results |

**Success Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "cl_user...",
      "displayName": "Alice Wong",
      "email": "alice@example.com",
      "avatarUrl": "https://..."
    }
  ]
}
```

**Notes:**
- Excludes current user from results
- Excludes blocked users
- Searches both displayName and email (case-insensitive, partial match)
- Requires JWT auth
