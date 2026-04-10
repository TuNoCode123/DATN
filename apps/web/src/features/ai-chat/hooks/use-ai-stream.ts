'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAiChatStore } from '@/lib/ai-chat-store';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function useAiStream() {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const { setStreaming, appendStreamToken, resetStream } = useAiChatStore();

  const send = useCallback(
    async (conversationId: string, message: string) => {
      // Reset previous stream
      resetStream();
      setStreaming(true);

      // Optimistically add user message to cache
      queryClient.setQueryData(
        ['ai-messages', conversationId],
        (old: { messages: Array<{ id: string; conversationId: string; role: string; content: string; tokenCount: number | null; createdAt: string }>; [key: string]: unknown } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            messages: [
              ...old.messages,
              {
                id: `optimistic-${Date.now()}`,
                conversationId,
                role: 'user' as const,
                content: message,
                tokenCount: null,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        },
      );

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const csrf = getCsrfToken();
        if (csrf) headers['X-CSRF-Token'] = csrf;

        const response = await fetch(
          `${API_BASE_URL}/ai-chat/conversations/${conversationId}/messages`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ message }),
            credentials: 'include',
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.token) {
                appendStreamToken(event.token);
              }

              if (event.done) {
                // Invalidate queries to refetch messages
                queryClient.invalidateQueries({
                  queryKey: ['ai-messages', conversationId],
                });
                queryClient.invalidateQueries({
                  queryKey: ['ai-conversations'],
                });
                return { creditsRemaining: event.creditsRemaining };
              }

              if (event.error) {
                throw new Error(event.error);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue; // Skip malformed JSON
              throw e;
            }
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;
        throw error;
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [queryClient, setStreaming, appendStreamToken, resetStream],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    resetStream();
  }, [resetStream]);

  return { send, cancel };
}
