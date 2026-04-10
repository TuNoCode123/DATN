'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface AiConversation {
  id: string;
  title: string | null;
  lastMessage: { content: string; role: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  tokenCount: number | null;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  userId: string;
  title: string | null;
  messages: AiMessage[];
  createdAt: string;
  updatedAt: string;
}

export function useAiConversations() {
  return useQuery({
    queryKey: ['ai-conversations'],
    queryFn: async () => {
      const { data } = await api.get<{ data: AiConversation[]; total: number }>(
        '/ai-chat/conversations',
      );
      return data;
    },
  });
}

export function useAiMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['ai-messages', conversationId],
    queryFn: async () => {
      const { data } = await api.get<ConversationDetail>(
        `/ai-chat/conversations/${conversationId}`,
      );
      return data;
    },
    enabled: !!conversationId,
  });
}

export function useCreateAiConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ id: string }>('/ai-chat/conversations');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
  });
}

export function useDeleteAiConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/ai-chat/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
  });
}
