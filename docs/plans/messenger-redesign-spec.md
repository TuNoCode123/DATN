# Chat UI/UX Redesign — Facebook Messenger Style

## Problem Analysis

After reviewing the current codebase, here are the root causes of each issue:

### Bug 1: Messages not displayed when clicking a conversation
- **Root cause**: `MessageArea` is conditionally rendered (`{activeConversationId ? <MessageArea /> : <Empty />}`) in `chat-layout.tsx:30-39`. Every conversation switch **unmounts** the entire `MessageArea` and **remounts** it, causing:
  - Full re-fetch of messages (React Query cache exists but component re-initializes)
  - Socket room leave + rejoin race condition
  - Flash of loading spinner before messages appear
- **Secondary issue**: `allMessages` in `message-area.tsx:80` does `flatMap().reverse()` which reverses ALL pages together. With multiple pages loaded, message ordering breaks.

### Bug 2: State not preserved on navigation
- **Root cause**: `activeConversationId` defaults to `null` in Zustand store (`chat-store.ts:75`). No persistence. When navigating away from `/chat` and back, the `ChatLayout` remounts with no selected conversation.
- The socket also disconnects on unmount (`use-socket-events.ts:110`) and must reconnect.

### Bug 3: Conversation list and chat panel feel disconnected
- **Root cause**: Sidebar toggle logic in `chat-layout.tsx:19-23` has conflicting CSS — `w-0` + `hidden md:block md:w-80` creates inconsistent behavior. On mobile, clicking back sets `activeConversation(null)` which causes a full remount cycle.

### Bug 4: Layout breaks when switching conversations
- **Root cause**: The conditional render causes a full DOM teardown/rebuild. The `MessageArea` component creates local state (`scrollRef`, `prevConvRef`, `showGroupInfo`) that is lost on every switch.

---

## Architecture Changes

### A. Keep MessageArea always mounted (key change)
Instead of conditional rendering, always render `MessageArea` but show/hide with CSS. This prevents unmount/remount cycles and preserves scroll position, loaded messages, and socket room state.

### B. Persist active conversation in Zustand with sessionStorage
Use Zustand `persist` middleware with `sessionStorage` so `activeConversationId` survives page navigation within the same tab.

### C. Fix message ordering
Replace `flatMap().reverse()` with proper page-aware ordering: pages come newest-first from API, messages within each page are newest-first. Need to reverse pages then reverse within each page, or flatten in correct order.

### D. Stable two-panel layout
Use a fixed CSS grid/flex layout where both panels are always in the DOM. Left panel is always visible on desktop. On mobile, use a slide transition rather than unmounting.

### E. Improve auto-scroll logic
Current auto-scroll (`message-area.tsx:66-70`) triggers on `data?.pages?.[0]?.data?.length` which is unreliable. Should scroll on: (1) initial load, (2) new message received while already at bottom, (3) own message sent. Should NOT scroll when loading older messages (infinite scroll upward).

---

## Task Breakdown

### Task 1: Fix message ordering and data flow
**Files**: `message-area.tsx`
- Fix `allMessages` computation to properly order messages across pages
- API returns newest-first per page, pages are newest-first → need to reverse both
- Correct: `pages.slice().reverse().flatMap(p => p.data.slice().reverse())`

### Task 2: Persist activeConversationId in sessionStorage
**Files**: `chat-store.ts`
- Add Zustand `persist` middleware for `activeConversationId` using `sessionStorage`
- On mount, restore last active conversation so navigating away/back preserves state

### Task 3: Always-mounted MessageArea with CSS visibility
**Files**: `chat-layout.tsx`, `message-area.tsx`
- Remove conditional rendering of `MessageArea`
- Render `MessageArea` for the active conversation, hide empty state when active
- Use `key={conversationId}` only when truly needed (or better: make `conversationId` a prop and handle changes internally without remounting)
- Keep the empty state as a sibling, toggled by CSS `hidden`

### Task 4: Fix auto-scroll behavior
**Files**: `message-area.tsx`
- Track whether user is "at bottom" (within 100px of scroll end)
- Auto-scroll to bottom on: initial load, new incoming message (if at bottom), own message sent
- Do NOT auto-scroll when loading older messages (scroll upward) — preserve scroll position
- Save/restore scroll position per conversation

### Task 5: Stable two-panel layout
**Files**: `chat-layout.tsx`
- Desktop: CSS grid `grid-cols-[320px_1fr]`, both panels always visible
- Mobile: Full-width panels with CSS transform slide (conversation list vs chat)
- Remove conflicting `w-0`/`hidden` toggle logic
- Smooth transition on mobile panel switch

### Task 6: Fix socket room management on conversation switch
**Files**: `message-area.tsx`
- Currently joins/leaves rooms in a `useEffect` with cleanup. The unmount/remount cycle causes leave→join race conditions
- With always-mounted approach, simplify to: when `conversationId` changes, leave old room, join new room (no cleanup-based leave needed)
- Ensure `mark_read` fires reliably on conversation open

### Task 7: Improve conversation list UX
**Files**: `conversation-list.tsx`, `conversation-item.tsx`
- Debounce search input (300ms)
- Add smooth hover/active transitions
- Ensure active conversation has clear visual highlight that doesn't shift layout
- Show typing indicator preview in conversation item ("typing...")

### Task 8: Polish empty state and edge cases
**Files**: `message-area.tsx`, `chat-layout.tsx`
- Empty conversation: show friendly "Say hello!" with enabled input
- No conversation selected: show centered prompt to select a conversation
- Connection lost: show subtle banner in chat area
- Smooth fade transitions between states

---

## File Impact Summary

| File | Changes |
|------|---------|
| `chat-store.ts` | Add persist middleware, add `scrollPositions` map |
| `chat-layout.tsx` | Rewrite layout to grid, always-mount panels |
| `message-area.tsx` | Fix ordering, fix scroll, fix room mgmt |
| `conversation-list.tsx` | Debounce search, typing preview |
| `conversation-item.tsx` | Typing indicator in preview |
| `message-input.tsx` | No changes needed |
| `message-bubble.tsx` | No changes needed |
| `use-chat.ts` | No changes needed |
| `use-socket-events.ts` | No changes needed |

## Non-goals (out of scope)
- Message list virtualization (react-window) — nice to have, not needed for correctness
- Lazy loading older messages rework — current infinite scroll works, just fix scroll position
- Local storage message cache — React Query cache is sufficient
