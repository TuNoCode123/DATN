'use client';

import { create } from 'zustand';

interface AiChatState {
  panelOpen: boolean;
  activeConversationId: string | null;
  isStreaming: boolean;
  streamingMessage: string;

  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setActiveConversation: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamToken: (token: string) => void;
  resetStream: () => void;
}

export const useAiChatStore = create<AiChatState>((set) => ({
  panelOpen: false,
  activeConversationId: null,
  isStreaming: false,
  streamingMessage: '',

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendStreamToken: (token) =>
    set((s) => ({ streamingMessage: s.streamingMessage + token })),
  resetStream: () => set({ streamingMessage: '', isStreaming: false }),
}));
