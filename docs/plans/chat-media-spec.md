# Chat Media, Reactions & Message Management

**Version:** 2.0
**Date:** 2026-03-27
**Status:** Ready for implementation

---

## 1. Overview

Extend the chat module to support sending images, files, and emoji in conversations. Leverages the existing S3 presigned-URL upload flow and the already-defined `IMAGE` message type.

### 1.1 Goals

- Users can send images (JPEG, PNG, WebP, GIF) inline in chat
- Users can send files (PDF, DOCX, XLSX, ZIP, etc.) as downloadable attachments
- Users can insert emoji via a picker UI
- All media uploads go through S3 presigned URLs (browser → S3 direct)
- Upload progress feedback and error handling in the UI
- Users can edit their own text messages
- Users can delete messages for themselves only ("Delete for me") or for everyone ("Delete for everyone")
- Users can react to any message with emoji (message reactions)

### 1.2 Out of Scope

- Voice messages / audio recording
- Video upload or playback
- Image editing / cropping before send
- Drag-and-drop upload (can be added later)
- Message forwarding
- Editing non-text messages (IMAGE/FILE content cannot be changed, only caption)

---

## 2. Database Changes

### 2.1 Add `FILE` to MessageType Enum

```prisma
enum MessageType {
  TEXT
  IMAGE
  FILE    // NEW
  SYSTEM
}
```

### 2.2 Add Attachment Fields to Message Model

```prisma
model Message {
  // ... existing fields ...

  // NEW — attachment metadata (nullable, only set for IMAGE/FILE messages)
  attachmentUrl   String?   // S3 public URL of the uploaded file
  attachmentName  String?   // Original filename (e.g. "homework.pdf")
  attachmentSize  Int?      // File size in bytes
  attachmentType  String?   // MIME type (e.g. "image/png", "application/pdf")

  // NEW — edit & delete support
  isEdited        Boolean   @default(false)   // true after content was edited
  editedAt        DateTime?                   // timestamp of last edit
  deletedFor      String[]  @default([])      // array of userIds who deleted this message for themselves
  deletedForAll   Boolean   @default(false)   // true = "Delete for everyone" was used

  // NEW — reactions relation
  reactions       MessageReaction[]
}
```

### 2.3 New Model: MessageReaction

```prisma
model MessageReaction {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  emoji     String   // Unicode emoji character (e.g. "👍", "❤️", "😂")
  createdAt DateTime @default(now())

  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([messageId, userId, emoji])   // one reaction per emoji per user per message
  @@index([messageId])
}
```

**Key design decisions:**
- **Separate fields instead of JSON** for attachments — queryable, type-safe at the Prisma level
- **`content` remains the text/caption** (optional for IMAGE/FILE messages)
- **`deletedFor` is an array of userIds** — simple, no extra join table. Works because the list is small (only users who explicitly deleted)
- **`deletedForAll` is a boolean** — when true, message content is replaced with "This message was deleted" for all users except the ones in `deletedFor` who won't see it at all
- **Reactions use a join table** — allows querying who reacted, grouping by emoji, and enforcing one-per-emoji-per-user

### 2.4 Migration

```bash
npx prisma migrate dev --name add_message_attachments_edit_delete_reactions
```

---

## 3. Backend Changes

### 3.1 New Endpoint: Chat Upload Presign

The existing `/admin/upload/presign` is admin-only. We need a user-facing endpoint scoped to chat.

**Controller:** `ChatController` (extend existing)

```
POST /api/chat/upload/presign
Auth: JWT (any authenticated user)
Body: { fileName: string, contentType: string }
Response: { uploadUrl, fileUrl, key, maxSizeMB }
```

**Allowed types for chat uploads:**

| Category | MIME Types | Max Size |
|----------|-----------|----------|
| Images | image/jpeg, image/png, image/webp, image/gif | 10 MB |
| Documents | application/pdf | 10 MB |
| Office | application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx), application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (.xlsx), application/vnd.openxmlformats-officedocument.presentationml.presentation (.pptx) | 10 MB |
| Archives | application/zip, application/x-rar-compressed | 20 MB |
| Text | text/plain (.txt), text/csv (.csv) | 5 MB |

S3 key pattern: `uploads/chat/{conversationId}/{timestamp}-{uuid}{ext}`

**Implementation:** Reuse `UploadService.generatePresignedUrl()` but with a chat-specific allowed types map and folder structure. Add a new method or create a thin `ChatUploadService` wrapper.

### 3.2 Update SendMessageDto

```typescript
export class SendMessageDto {
  @IsString()
  conversationId: string;

  @IsString()
  @IsOptional()              // NOW OPTIONAL — can be empty for pure file messages
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType = MessageType.TEXT;

  @IsString()
  clientId: string;

  // NEW fields for attachments
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentName?: string;

  @IsOptional()
  @IsNumber()
  attachmentSize?: number;

  @IsOptional()
  @IsString()
  attachmentType?: string;
}
```

### 3.3 Update ChatService.createMessage()

- Accept attachment fields from DTO
- Validate: if `type` is `IMAGE` or `FILE`, `attachmentUrl` must be present
- Validate: `attachmentUrl` must point to our S3 bucket (prevent arbitrary URLs)
- Store attachment metadata in the Message record
- `content` is optional caption text for IMAGE/FILE messages

### 3.4 Update ChatGateway send_message Handler

- Pass attachment fields through to `createMessage()`
- Broadcast attachment metadata in `new_message` event payload
- Validation: if attachment fields present but type is TEXT, reject

### 3.5 WebSocket Event Changes

**`send_message` payload (updated):**
```typescript
{
  conversationId: string;
  content?: string;          // optional caption
  type: 'TEXT' | 'IMAGE' | 'FILE';
  clientId: string;
  attachmentUrl?: string;    // required for IMAGE/FILE
  attachmentName?: string;   // required for FILE
  attachmentSize?: number;
  attachmentType?: string;
}
```

**`new_message` broadcast payload (updated):**
```typescript
{
  id: string;
  conversationId: string;
  senderId: string;
  type: 'TEXT' | 'IMAGE' | 'FILE';
  content: string;
  clientId: string;
  seqNumber: number;
  createdAt: string;
  sender: { id, displayName, avatarUrl };
  // NEW
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentType?: string;
}
```

### 3.6 Message Editing

**REST Endpoint:**
```
PATCH /api/chat/conversations/:conversationId/messages/:messageId
Auth: JWT
Body: { content: string }
Response: { id, content, isEdited, editedAt }
```

**Rules:**
- Only the sender can edit their own messages
- Only TEXT message content or IMAGE/FILE caption can be edited
- Cannot edit SYSTEM messages
- Cannot edit a `deletedForAll` message
- Must be a member of the conversation
- Edited content must be 1-5000 characters
- Sets `isEdited = true` and `editedAt = now()`

**WebSocket Event:**

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `edit_message` | `{ conversationId, messageId, content }` |
| Server → Room | `message_edited` | `{ conversationId, messageId, content, editedAt }` |

**ChatService method:**
```typescript
async editMessage(conversationId: string, messageId: string, userId: string, newContent: string) {
  // 1. Assert user is member of conversation
  // 2. Find message, assert senderId === userId
  // 3. Assert message is not deletedForAll
  // 4. Assert message type is TEXT, IMAGE, or FILE (not SYSTEM)
  // 5. Update content, isEdited = true, editedAt = now()
  // 6. Return updated message
}
```

### 3.7 Message Deletion

Two modes following the Messenger/WhatsApp pattern:

#### 3.7.1 Delete for Me

Hides the message only for the requesting user. Other participants still see it.

**REST Endpoint:**
```
DELETE /api/chat/conversations/:conversationId/messages/:messageId?mode=self
Auth: JWT
Response: { success: true }
```

**Behavior:**
- Adds `userId` to the message's `deletedFor` array
- No broadcast — only affects the requesting user's view
- Irreversible (no "undo")
- Works on any message type (TEXT, IMAGE, FILE, SYSTEM)
- Works on messages from any sender (not just own messages)

**ChatService method:**
```typescript
async deleteForMe(conversationId: string, messageId: string, userId: string) {
  // 1. Assert user is member of conversation
  // 2. Assert message belongs to this conversation
  // 3. Add userId to deletedFor array (if not already present)
}
```

#### 3.7.2 Delete for Everyone

Replaces the message content with a "deleted" placeholder for all participants.

**REST Endpoint:**
```
DELETE /api/chat/conversations/:conversationId/messages/:messageId?mode=everyone
Auth: JWT
Response: { success: true }
```

**Rules:**
- Only the sender can delete for everyone
- Time limit: within 1 hour of sending (configurable)
- Sets `deletedForAll = true`
- Clears `content` to empty string
- Clears attachment fields (`attachmentUrl`, `attachmentName`, `attachmentSize`, `attachmentType`)
- Does NOT delete the S3 file immediately (orphan cleanup can be a background job later)
- SYSTEM messages cannot be deleted for everyone

**WebSocket Events:**

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `delete_message` | `{ conversationId, messageId, mode: 'self' \| 'everyone' }` |
| Server → Room | `message_deleted` | `{ conversationId, messageId, deletedForAll: true }` |

Note: `delete for me` does NOT broadcast — it's a local operation. Only `delete for everyone` broadcasts.

**ChatService method:**
```typescript
async deleteForEveryone(conversationId: string, messageId: string, userId: string) {
  // 1. Assert user is member of conversation
  // 2. Find message, assert senderId === userId
  // 3. Assert message is not SYSTEM type
  // 4. Assert message was sent within the last hour
  // 5. Set deletedForAll = true, clear content and attachment fields
  // 6. Return success
}
```

#### 3.7.3 Filtering Deleted Messages in Queries

Update `ChatService.getMessages()`:
```typescript
// When fetching messages for a user:
// 1. Exclude messages where userId is in deletedFor array
// 2. For deletedForAll messages: return them but with content = "" and a flag
//    so the UI can show "This message was deleted"
```

### 3.8 Message Reactions

**REST Endpoints:**
```
PUT    /api/chat/conversations/:conversationId/messages/:messageId/reactions
Auth: JWT
Body: { emoji: string }
Response: { reactions: ReactionGroup[] }

DELETE /api/chat/conversations/:conversationId/messages/:messageId/reactions
Auth: JWT
Body: { emoji: string }
Response: { reactions: ReactionGroup[] }
```

**ReactionGroup format (returned with messages):**
```typescript
interface ReactionGroup {
  emoji: string;       // "👍"
  count: number;       // 3
  userIds: string[];   // ["user1", "user2", "user3"]
  reacted: boolean;    // true if current user reacted with this emoji
}
```

**Rules:**
- Any conversation member can react to any message (that isn't deletedForAll)
- One reaction per emoji per user per message (toggle: add if not exists, handled by PUT/DELETE)
- Cannot react to messages in `deletedFor` (for that user) or `deletedForAll`
- Popular emoji quick-access: 👍 ❤️ 😂 😮 😢 🔥 (shown in UI, but any emoji allowed)

**WebSocket Events:**

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `toggle_reaction` | `{ conversationId, messageId, emoji }` |
| Server → Room | `reaction_updated` | `{ conversationId, messageId, emoji, userId, action: 'add' \| 'remove', reactions: ReactionGroup[] }` |

**ChatService methods:**
```typescript
async addReaction(conversationId: string, messageId: string, userId: string, emoji: string) {
  // 1. Assert user is member
  // 2. Assert message exists, not deletedForAll, not in deletedFor for this user
  // 3. Upsert reaction (idempotent — if already exists, no-op)
  // 4. Return grouped reactions for the message
}

async removeReaction(conversationId: string, messageId: string, userId: string, emoji: string) {
  // 1. Assert user is member
  // 2. Delete reaction if exists
  // 3. Return grouped reactions for the message
}

async getReactionsGrouped(messageId: string, currentUserId: string): ReactionGroup[] {
  // Group reactions by emoji, count, include userIds, set reacted flag
}
```

### 3.9 Updated Message Response Shape

All message queries and broadcasts now return:

```typescript
{
  id: string;
  conversationId: string;
  senderId: string | null;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  content: string;
  clientId: string;
  seqNumber: number;
  createdAt: string;
  sender: { id, displayName, avatarUrl } | null;
  // Attachments
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentType?: string;
  // Edit state
  isEdited: boolean;
  editedAt: string | null;
  // Delete state
  deletedForAll: boolean;
  // Reactions
  reactions: ReactionGroup[];
}
```

---

## 4. Frontend Changes

### 4.1 Updated Types

```typescript
// chat-store.ts — update ChatMessage interface
interface ChatMessage {
  // ... existing fields ...
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentType?: string;
  // Edit & delete
  isEdited?: boolean;
  editedAt?: string;
  deletedForAll?: boolean;
  // Reactions
  reactions?: ReactionGroup[];
}

interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  reacted: boolean;   // current user reacted with this emoji
}
```

### 4.2 MessageInput — Media Toolbar

Extend the existing `MessageInput` component with an attachment toolbar:

```
┌─────────────────────────────────────────────────────┐
│ [📎] [😊]  │  Type a message...            [Send ▶] │
└─────────────────────────────────────────────────────┘
```

**Buttons:**
1. **📎 Attachment** — Opens file picker (native `<input type="file">`)
   - Accept: `image/*,.pdf,.docx,.xlsx,.pptx,.zip,.rar,.txt,.csv`
   - Multiple: `false` (one file per message)
2. **😊 Emoji** — Opens emoji picker popover

**Upload Flow (user clicks 📎):**
1. User selects file → validate type & size client-side
2. Show upload preview:
   - Image: thumbnail preview with cancel button
   - File: filename + size + icon with cancel button
3. Call `POST /api/chat/upload/presign` with fileName + contentType
4. Upload file to S3 via presigned PUT URL
5. Show progress bar during upload
6. On success: auto-send message with type IMAGE/FILE + attachmentUrl
7. On error: show error toast, allow retry

**Upload Preview UI (between toolbar and message list):**
```
┌──────────────────────────────────────┐
│ [×]  📷 photo.jpg (2.1 MB)          │
│      ████████████░░░░░░  67%         │
│      [Cancel]                        │
└──────────────────────────────────────┘
```

Or for images, show actual thumbnail:
```
┌──────────────────────────────────────┐
│ [×]  ┌──────┐                        │
│      │ img  │  photo.jpg (2.1 MB)    │
│      └──────┘  ████████████░░  67%   │
│      Optional caption: [________]    │
│      [Cancel]  [Send]                │
└──────────────────────────────────────┘
```

### 4.3 MessageBubble — Media Rendering

**IMAGE messages:**
```
┌─────────────────────────┐
│  ┌───────────────────┐  │
│  │                   │  │
│  │   (image preview) │  │  ← Click to open full-size in modal/new tab
│  │   max-w: 300px    │  │
│  │   max-h: 400px    │  │
│  └───────────────────┘  │
│  Optional caption text  │
│                 12:34 ✓ │
└─────────────────────────┘
```

- Use Next.js `<Image>` or `<img>` with lazy loading
- Show loading skeleton while image loads
- Click opens lightbox modal (full-size image with zoom)
- GIF auto-plays
- Blurhash or low-quality placeholder (optional, v2)

**FILE messages:**
```
┌──────────────────────────────┐
│  📄  homework.pdf            │
│      2.1 MB  •  PDF          │
│      [Download ↓]            │
│  Optional caption text       │
│                     12:34 ✓  │
└──────────────────────────────┘
```

- File icon based on MIME type (📄 PDF, 📊 Excel, 📝 Word, 📦 ZIP, 📋 TXT)
- Click or Download button opens file URL in new tab
- Show human-readable file size (formatBytes helper)

### 4.4 Emoji Picker

**Library:** `emoji-mart` (or `@emoji-mart/react`) — lightweight, customizable, well-maintained.

**Integration:**
```
┌─────────────────────────────────┐
│ 😀 😃 😄 😁 😆 😅 🤣 😂       │
│ 😊 😇 🙂 🙃 😉 😌 😍 🥰       │
│ ─── Categories ───              │
│ 😀 People  🐶 Animals  🍔 Food │
│ ⚽ Activity 🚗 Travel  💡 Obj  │
│ [Search emoji...]               │
└─────────────────────────────────┘
```

- Rendered as a popover anchored to the 😊 button
- Clicking an emoji inserts it at cursor position in textarea
- Close on click outside or Escape
- Recently used emoji section at top
- Search functionality built-in

**Note:** Emoji are just Unicode characters inserted into the text content. No special message type needed — they work with regular TEXT messages.

### 4.5 Image Lightbox Modal

When user clicks an image in chat:

```
┌──────────────────────────────────────────┐
│  [×]                      [↓ Download]   │
│                                          │
│         ┌──────────────────┐             │
│         │                  │             │
│         │   Full-size      │             │
│         │   image          │             │
│         │                  │             │
│         └──────────────────┘             │
│                                          │
│  [← Prev]              [Next →]         │
└──────────────────────────────────────────┘
```

- Full-screen overlay with dark backdrop
- Navigate between images in conversation (optional, v2)
- Download button
- Close on Escape or click backdrop
- Pinch-to-zoom on mobile (optional, v2)

### 4.6 Hook Changes (use-socket-events.ts)

Update `sendMessage` to accept attachment fields:

```typescript
sendMessage(
  conversationId: string,
  content: string,
  clientId: string,
  type: MessageType,
  attachment?: {
    url: string;
    name: string;
    size: number;
    type: string;
  },
  callback?: (response) => void,
)
```

### 4.7 New Hook: useChatUpload

```typescript
function useChatUpload(conversationId: string) {
  return {
    uploadFile: (file: File) => Promise<{ url, name, size, type }>,
    uploading: boolean,
    progress: number,        // 0-100
    error: string | null,
    cancel: () => void,
    reset: () => void,
  };
}
```

**Implementation:**
1. Validate file type/size
2. Request presigned URL from `POST /api/chat/upload/presign`
3. PUT to S3 using `XMLHttpRequest` (for progress tracking, fetch doesn't support upload progress)
4. Return the public file URL on completion

### 4.8 MessageBubble — Context Menu (Edit, Delete, React)

On hover or right-click on a message bubble, show an action bar:

**Hover action bar (appears top-right of bubble):**
```
                          ┌─────────────────────┐
                          │ 😊  ↩️  ✏️  🗑️     │
                          └─────────────────────┘
┌─────────────────────────┐
│  Hello, how are you?    │
│                 12:34 ✓ │
└─────────────────────────┘
```

| Icon | Action | Condition |
|------|--------|-----------|
| 😊 | Open reaction picker | Always (any message not deleted) |
| ↩️ | Reply (future) | Hidden for now |
| ✏️ | Edit message | Only on own messages, not SYSTEM, not deletedForAll |
| 🗑️ | Delete menu | Always |

**Delete dropdown menu (click 🗑️):**
```
┌──────────────────────────┐
│  Delete for me           │
│  Delete for everyone     │  ← only shown for own messages within 1 hour
└──────────────────────────┘
```

- "Delete for me" — always available
- "Delete for everyone" — only if sender === currentUser AND message age < 1 hour
- Both show a confirmation dialog before executing

**Confirmation dialog:**
```
┌─────────────────────────────────────┐
│  Delete this message?               │
│                                     │
│  ○ Delete for me                    │
│  ○ Delete for everyone              │
│                                     │
│  [Cancel]           [Delete]        │
└─────────────────────────────────────┘
```

### 4.9 Inline Edit Mode

When user clicks ✏️ edit:

```
┌─────────────────────────────────────────────────────┐
│  ┌── Editing ──────────────────────────────────┐    │
│  │ Hello, how are you doing today?             │    │
│  └─────────────────────────────────────────────┘    │
│  [Cancel]  [Save ✓]                                 │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Replace the MessageInput with an edit input pre-filled with the message content
- Show "Editing" banner above the input with the original message preview
- Enter or click Save → emit `edit_message` via socket
- Escape or Cancel → exit edit mode, restore normal input
- After edit: message shows "(edited)" label next to timestamp

**Edited message display:**
```
┌─────────────────────────────────┐
│  Hello, how are you doing?      │
│            12:34  (edited)    ✓ │
└─────────────────────────────────┘
```

### 4.10 Deleted Message Display

**"Delete for everyone" — shown to all other users:**
```
┌─────────────────────────────────┐
│  🚫 This message was deleted    │
│                         12:34   │
└─────────────────────────────────┘
```

- Gray italic text, no reactions, no action bar
- Bubble is smaller/muted compared to regular messages
- Cannot react to or edit deleted messages

**"Delete for me" — message simply disappears from the user's view** (not shown at all).

### 4.11 Reaction Display & Picker

**Reactions below message bubble:**
```
┌─────────────────────────────┐
│  Great work on the test!    │
│                     12:34 ✓ │
└─────────────────────────────┘
 [ 👍 3 ] [ ❤️ 2 ] [ 😂 1 ]     ← reaction pills
```

**Reaction pill behavior:**
- Each pill shows emoji + count
- Highlighted/outlined if current user reacted with that emoji
- Click a pill → toggle own reaction (add if not reacted, remove if already reacted)
- Hover/long-press a pill → tooltip showing who reacted ("Alice, Bob, and you")

**Quick reaction picker (click 😊 in action bar):**
```
┌──────────────────────────────────┐
│  👍  ❤️  😂  😮  😢  🔥   [+]  │
└──────────────────────────────────┘
```

- 6 quick emoji for fast reactions
- [+] button opens the full emoji picker (same `@emoji-mart/react` picker)
- Selecting any emoji immediately sends the reaction and closes the picker

### 4.12 Hook Changes for Edit/Delete/Reactions (use-socket-events.ts)

Add new socket event emitters and listeners:

```typescript
// Emitters
editMessage(conversationId: string, messageId: string, content: string, callback?)
deleteMessage(conversationId: string, messageId: string, mode: 'self' | 'everyone', callback?)
toggleReaction(conversationId: string, messageId: string, emoji: string, callback?)

// Listeners (auto-setup)
'message_edited'    → update message in React Query cache (content, isEdited, editedAt)
'message_deleted'   → if deletedForAll: update message in cache; if self: remove from cache
'reaction_updated'  → update reactions array for the message in cache
```

### 4.13 New Hooks

```typescript
// use-edit-message.ts
function useEditMessage() {
  return {
    editingMessageId: string | null,
    startEdit: (message: ChatMessage) => void,
    cancelEdit: () => void,
    submitEdit: (newContent: string) => void,
  };
}

// use-delete-message.ts
function useDeleteMessage() {
  return {
    deleteForMe: (conversationId: string, messageId: string) => void,
    deleteForEveryone: (conversationId: string, messageId: string) => void,
    isDeleting: boolean,
  };
}
```

---

## 5. Paste & Clipboard Support

Allow users to paste images from clipboard directly into chat:

- Listen for `paste` event on the message input
- If `clipboardData` contains image items (`items[i].type.startsWith('image/')`)
- Convert to File blob, trigger the same upload flow
- Show preview immediately using `URL.createObjectURL()`

---

## 6. Security Considerations

### 6.1 Upload Validation
- **Client-side:** Validate file type and size before upload
- **Server-side (presign):** Only generate presigned URLs for allowed MIME types
- **S3-side:** Presigned URL includes `ContentType` — S3 rejects mismatched types
- **Message validation:** Backend verifies `attachmentUrl` points to our S3 bucket domain

### 6.2 Content Safety
- No server-side virus scanning in v1 (future improvement)
- Files are public-readable once uploaded (same as existing S3 setup)
- Presigned URLs expire in 5 minutes (existing behavior)
- No executable file types allowed (.exe, .bat, .sh, etc.)

### 6.3 Rate Limiting
- Existing rate limit (10 messages/5s) applies to file messages too
- Presign endpoint: 5 requests per minute per user (prevent abuse)

---

## 7. File Structure

### Backend (new/modified files)

```
apps/api/src/chat/
├── dto/
│   ├── send-message.dto.ts          # MODIFY — add attachment fields, content optional
│   ├── edit-message.dto.ts          # NEW — edit message DTO
│   ├── delete-message.dto.ts        # NEW — delete message DTO (mode: self|everyone)
│   ├── reaction.dto.ts              # NEW — add/remove reaction DTO
│   └── chat-upload.dto.ts           # NEW — presign request DTO
├── chat.controller.ts               # MODIFY — add upload, edit, delete, reaction endpoints
├── chat.service.ts                  # MODIFY — createMessage, editMessage, deleteMessage, reactions
├── chat.gateway.ts                  # MODIFY — add edit_message, delete_message, toggle_reaction events
└── chat-upload.service.ts           # NEW — chat-specific upload logic (wraps UploadService)

apps/api/prisma/
└── schema.prisma                    # MODIFY — MessageReaction model, Message fields
```

### Frontend (new/modified files)

```
apps/web/src/
├── components/chat/
│   ├── message-input.tsx            # MODIFY — add toolbar, file picker, emoji, edit mode
│   ├── message-bubble.tsx           # MODIFY — render IMAGE/FILE, edit/delete/deleted states, reactions
│   ├── message-actions.tsx          # NEW — hover action bar (react, edit, delete)
│   ├── message-reactions.tsx        # NEW — reaction pills display below bubble
│   ├── reaction-picker.tsx          # NEW — quick reaction picker (6 emoji + full picker)
│   ├── delete-message-dialog.tsx    # NEW — confirmation dialog for delete
│   ├── image-lightbox.tsx           # NEW — full-size image modal
│   ├── upload-preview.tsx           # NEW — file/image preview with progress
│   ├── emoji-picker-button.tsx      # NEW — emoji picker popover wrapper
│   └── file-icon.tsx               # NEW — file type icon mapper
├── features/chat/hooks/
│   ├── use-socket-events.ts         # MODIFY — add edit, delete, reaction events
│   ├── use-chat-upload.ts           # NEW — upload hook with progress
│   ├── use-edit-message.ts          # NEW — edit mode state management
│   └── use-delete-message.ts        # NEW — delete with confirmation
├── lib/
│   ├── chat-store.ts                # MODIFY — update ChatMessage type, ReactionGroup
│   └── format-bytes.ts             # NEW — utility (1024 → "1 KB")
```

---

## 8. npm Dependencies

### Frontend

| Package | Purpose | Size |
|---------|---------|------|
| `@emoji-mart/react` | Emoji picker UI | ~40 KB gzipped |
| `@emoji-mart/data` | Emoji data set | ~60 KB gzipped |

No other new dependencies needed — file upload uses native `XMLHttpRequest`.

---

## 9. Implementation Order

### Phase 1: Database & Backend Core
1. Update Prisma schema: `FILE` enum, attachment fields, edit/delete fields, `MessageReaction` model
2. Run migration
3. Create DTOs: `EditMessageDto`, `DeleteMessageDto`, `ReactionDto`, `ChatUploadDto`
4. Create `ChatUploadService` + presign endpoint
5. Update `SendMessageDto` — add attachment fields, make content optional
6. Update `ChatService.createMessage()` — store attachments
7. Add `ChatService.editMessage()` — validate ownership, update content + isEdited
8. Add `ChatService.deleteForMe()` — push userId to deletedFor array
9. Add `ChatService.deleteForEveryone()` — validate ownership + time limit, clear content
10. Add `ChatService.addReaction()` / `removeReaction()` — upsert/delete + return grouped
11. Update `ChatService.getMessages()` — filter deletedFor, redact deletedForAll, include reactions
12. Add REST endpoints in `ChatController` — PATCH edit, DELETE message, PUT/DELETE reactions

### Phase 2: Backend WebSocket Events
1. Add `edit_message` handler in gateway → broadcast `message_edited`
2. Add `delete_message` handler in gateway → broadcast `message_deleted` (only for everyone mode)
3. Add `toggle_reaction` handler in gateway → broadcast `reaction_updated`
4. Pass attachment fields through `send_message` handler

### Phase 3: Frontend — File Upload & Display
1. Create `useChatUpload` hook
2. Create `upload-preview.tsx` component
3. Add file picker button to `MessageInput`
4. Wire up upload flow: select → presign → upload → send message
5. Add paste-to-upload support
6. Update `MessageBubble` — render IMAGE (inline preview) + FILE (card + download)
7. Create `image-lightbox.tsx` modal
8. Create `file-icon.tsx` + `format-bytes.ts` helpers

### Phase 4: Frontend — Edit & Delete
1. Create `use-edit-message.ts` hook (edit mode state)
2. Update `MessageInput` — edit mode with pre-filled content + "Editing" banner
3. Create `message-actions.tsx` — hover action bar
4. Create `delete-message-dialog.tsx` — confirmation dialog
5. Create `use-delete-message.ts` hook
6. Update `MessageBubble` — "(edited)" label, deleted message placeholder
7. Update `use-socket-events.ts` — listen for `message_edited`, `message_deleted`

### Phase 5: Frontend — Reactions
1. Create `reaction-picker.tsx` — quick 6-emoji bar + full picker
2. Create `message-reactions.tsx` — reaction pills below bubble
3. Wire reaction toggle via socket events
4. Update `use-socket-events.ts` — listen for `reaction_updated`

### Phase 6: Frontend — Emoji Picker
1. Install `@emoji-mart/react` + `@emoji-mart/data`
2. Create `emoji-picker-button.tsx`
3. Wire into `MessageInput` toolbar

---

## 10. Testing Checklist

### Media Upload
- [ ] Upload image → shows in chat as inline preview
- [ ] Upload PDF → shows as file card with download button
- [ ] Upload .docx, .xlsx → correct file icon and download
- [ ] Upload oversized file → client-side error before upload
- [ ] Upload disallowed type (.exe) → rejected
- [ ] Cancel upload mid-progress → upload aborted, no message sent
- [ ] Paste image from clipboard → triggers upload flow
- [ ] Send image with caption → image + caption text displayed
- [ ] Click image → lightbox opens with full-size view
- [ ] Optimistic UI: file message shows pending state during send
- [ ] Failed upload → error state, retry available
- [ ] Scroll through conversation with many images → no jank (lazy loading)
- [ ] Mobile responsive: image and file cards scale properly

### Emoji
- [ ] Emoji picker → opens, select emoji → inserted in textarea at cursor position
- [ ] Multiple emoji in text message → renders correctly
- [ ] Emoji picker closes on click outside or Escape
- [ ] Recently used emoji appear at top of picker

### Message Editing
- [ ] Click edit → input switches to edit mode with original content
- [ ] Save edit → message updates inline, shows "(edited)" label
- [ ] Cancel edit → returns to normal input, no changes
- [ ] Edit received by other users in real-time via socket
- [ ] Cannot edit another user's message (edit button hidden)
- [ ] Cannot edit SYSTEM messages (edit button hidden)
- [ ] Cannot edit a deletedForAll message
- [ ] Edit preserves attachment (IMAGE/FILE) — only caption changes
- [ ] Empty content rejected (min 1 char for TEXT messages)

### Message Deletion — Delete for Me
- [ ] Delete for me → message disappears from own view immediately
- [ ] Message still visible to other participants
- [ ] Can delete any message (own or others') for self
- [ ] Confirmation dialog shown before deletion
- [ ] Deleted messages excluded when scrolling/loading older messages

### Message Deletion — Delete for Everyone
- [ ] Delete for everyone → message replaced with "This message was deleted" for all users
- [ ] Only available on own messages
- [ ] Only available within 1 hour of sending
- [ ] After 1 hour: "Delete for everyone" option disappears
- [ ] Other users see deletion in real-time via socket
- [ ] Deleted message cannot be reacted to or edited
- [ ] Group chat: all members see "This message was deleted"
- [ ] Confirmation dialog shown before deletion

### Message Reactions
- [ ] Hover message → action bar appears with reaction button
- [ ] Click 😊 → quick reaction picker shows 6 common emoji
- [ ] Click [+] in picker → full emoji picker opens
- [ ] Select emoji → reaction pill appears below message
- [ ] Click own reaction pill → removes the reaction (toggle)
- [ ] Multiple users react with same emoji → count increases
- [ ] Reaction pill highlighted when current user has reacted
- [ ] Hover reaction pill → tooltip shows who reacted
- [ ] Reaction updates appear in real-time for all users via socket
- [ ] Cannot react to deletedForAll messages
- [ ] Reactions visible in both direct and group chats
