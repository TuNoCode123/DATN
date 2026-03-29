import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatConversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string | null;
  avatarUrl: string | null;
  lastMessageSeq: number;
  updatedAt: string;
  unreadCount: number;
  lastMessage: {
    id: string;
    content: string;
    type: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
  members: {
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
    role?: string;
  }[];
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  reacted: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  content: string;
  clientId?: string;
  seqNumber: number;
  createdAt: string;
  sender?: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  // Attachments
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentType?: string | null;
  // Edit & delete
  isEdited?: boolean;
  editedAt?: string | null;
  deletedForAll?: boolean;
  // Reactions
  reactions?: ReactionGroup[];
  // Optimistic UI
  pending?: boolean;
  failed?: boolean;
}

interface TypingUser {
  userId: string;
  displayName: string;
}

interface ChatState {
  activeConversationId: string | null;
  sidebarOpen: boolean;
  socketConnected: boolean;
  chatBubbleOpen: boolean;
  typingUsers: Record<string, TypingUser[]>; // conversationId -> users
  onlineUsers: Record<string, boolean>;

  setActiveConversation: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSocketConnected: (connected: boolean) => void;
  setChatBubbleOpen: (open: boolean) => void;
  toggleChatBubble: () => void;

  addTypingUser: (conversationId: string, user: TypingUser) => void;
  removeTypingUser: (conversationId: string, userId: string) => void;

  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  setOnlineUsers: (userIds: string[]) => void;
}

export const useChatStore = create<ChatState>()(
  persist<ChatState, [], [], Pick<ChatState, 'activeConversationId' | 'sidebarOpen'>>(
    (set) => ({
  activeConversationId: null,
  sidebarOpen: true,
  socketConnected: false,
  chatBubbleOpen: false,
  typingUsers: {},
  onlineUsers: {},

  setActiveConversation: (id) => set({ activeConversationId: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setChatBubbleOpen: (open) => set({ chatBubbleOpen: open }),
  toggleChatBubble: () => set((s) => ({ chatBubbleOpen: !s.chatBubbleOpen })),

  addTypingUser: (conversationId, user) =>
    set((s) => {
      const current = s.typingUsers[conversationId] || [];
      if (current.some((u) => u.userId === user.userId)) return s;
      return {
        typingUsers: {
          ...s.typingUsers,
          [conversationId]: [...current, user],
        },
      };
    }),

  removeTypingUser: (conversationId, userId) =>
    set((s) => {
      const current = s.typingUsers[conversationId] || [];
      return {
        typingUsers: {
          ...s.typingUsers,
          [conversationId]: current.filter((u) => u.userId !== userId),
        },
      };
    }),

  setUserOnline: (userId) =>
    set((s) => {
      if (s.onlineUsers[userId]) return s;
      return { onlineUsers: { ...s.onlineUsers, [userId]: true } };
    }),

  setUserOffline: (userId) =>
    set((s) => {
      if (!s.onlineUsers[userId]) return s;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [userId]: _unused, ...rest } = s.onlineUsers;
      return { onlineUsers: rest };
    }),

  setOnlineUsers: (userIds) =>
    set({
      onlineUsers: Object.fromEntries(userIds.map((id) => [id, true])),
    }),
}),
    {
      name: 'chat-ui-state',
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return;
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return;
          sessionStorage.removeItem(name);
        },
      },
      partialize: (state) => ({
        activeConversationId: state.activeConversationId,
        sidebarOpen: state.sidebarOpen,
      }),
    },
  ),
);
