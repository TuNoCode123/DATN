import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ChatConversation, ChatMessage } from '@/lib/chat-store';

// ─── Conversations ─────────────────────────────────

export function useConversations(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['conversations', page, limit],
    queryFn: async () => {
      const { data } = await api.get<{
        data: ChatConversation[];
        total: number;
        page: number;
        limit: number;
      }>('/chat/conversations', { params: { page, limit } });
      return data;
    },
  });
}

export function useConversationDetail(id: string | null) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const { data } = await api.get(`/chat/conversations/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

// ─── Messages (infinite scroll) ────────────────────

export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      const params: Record<string, string | number> = { limit: 30 };
      if (pageParam) params.before = pageParam;
      const { data } = await api.get<{ data: ChatMessage[]; hasMore: boolean }>(
        `/chat/conversations/${conversationId}/messages`,
        { params },
      );
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.data.length === 0) return undefined;
      return lastPage.data[lastPage.data.length - 1].id;
    },
    enabled: !!conversationId,
  });
}

// ─── Mutations ─────────────────────────────────────

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      type: 'DIRECT' | 'GROUP';
      memberId?: string;
      memberIds?: string[];
      name?: string;
    }) => {
      const { data } = await api.post('/chat/conversations', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, seqNumber }: { conversationId: string; seqNumber: number }) => {
      const { data } = await api.patch(`/chat/conversations/${conversationId}/read`, { seqNumber });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; avatarUrl?: string }) => {
      const { data } = await api.patch(`/chat/conversations/${id}`, body);
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['conversation', vars.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useAddMembers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, userIds }: { conversationId: string; userIds: string[] }) => {
      const { data } = await api.post(`/chat/conversations/${conversationId}/members`, { userIds });
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['conversation', vars.conversationId] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const { data } = await api.delete(`/chat/conversations/${conversationId}/members/${userId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
