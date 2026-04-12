'use client';

import { useState, useRef, useCallback } from 'react';
import { Button, message as antMessage } from 'antd';
import { SendOutlined, PaperClipOutlined, CloseOutlined } from '@ant-design/icons';
import { connectSocket, getSocket } from '@/lib/socket';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth-store';
import { type ChatMessage } from '@/lib/chat-store';
import { useChatUpload } from '@/features/chat/hooks/use-chat-upload';
import { UploadPreview } from './upload-preview';
import { EmojiPickerButton } from './emoji-picker-button';

const FILE_ACCEPT = 'image/*,.pdf,.docx,.xlsx,.pptx,.zip,.rar,.txt,.csv';

interface Props {
  conversationId: string;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
}

export function MessageInput({ conversationId, editingMessage, onCancelEdit }: Props) {
  const [text, setText] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { uploadFile, uploading, progress, error: uploadError, cancel: cancelUpload, reset: resetUpload, validateFile } = useChatUpload();

  // Pre-fill text when entering edit mode
  const isEditing = !!editingMessage;
  const [editText, setEditText] = useState('');

  // When editingMessage changes, set the edit text
  if (isEditing && editText === '' && editingMessage.content) {
    setEditText(editingMessage.content);
  }

  const currentText = isEditing ? editText : text;
  const setCurrentText = isEditing ? setEditText : setText;

  // ─── Send new message ──────────────────────────────

  const handleSend = useCallback(async () => {
    // If there's a pending file, upload and send
    if (pendingFile) {
      try {
        const result = await uploadFile(pendingFile);
        const clientId = crypto.randomUUID();
        const isImage = pendingFile.type.startsWith('image/');
        const msgType = isImage ? 'IMAGE' : 'FILE';

        // Always emit — socket.io buffers while disconnected and flushes on reconnect.
        const socket = connectSocket();
        socket.emit(
          'send_message',
          {
            conversationId,
            content: text.trim() || '',
            type: msgType,
            clientId,
            attachmentUrl: result.url,
            attachmentName: result.name,
            attachmentSize: result.size,
            attachmentType: result.type,
          },
          (res: { success: boolean; message?: ChatMessage }) => {
            if (res.success && res.message) {
              queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }
          },
        );
        setPendingFile(null);
        setText('');
        resetUpload();
        return;
      } catch {
        // Error handled by upload hook
        return;
      }
    }

    // Regular text message
    const content = text.trim();
    if (!content) return;

    const clientId = crypto.randomUUID();

    // Optimistic update
    queryClient.setQueryData(['messages', conversationId], (old: unknown) => {
      if (!old) return old;
      const data = old as { pages: Array<{ data: unknown[] }> };
      const optimisticMsg = {
        id: clientId,
        conversationId,
        senderId: user?.id || '',
        type: 'TEXT' as const,
        content,
        clientId,
        seqNumber: -1,
        createdAt: new Date().toISOString(),
        sender: user ? { id: user.id, displayName: user.displayName || null, avatarUrl: null } : undefined,
        pending: true,
        reactions: [],
      };
      const firstPage = data.pages[0];
      return {
        ...data,
        pages: [
          { ...firstPage, data: [optimisticMsg, ...firstPage.data] },
          ...data.pages.slice(1),
        ],
      };
    });

    setText('');
    // Ensure a socket exists; emits issued while disconnected are buffered
    // by socket.io and delivered automatically on reconnect.
    const socket = connectSocket();
    socket.emit('typing_stop', { conversationId });

    const sendCallback = (res: { success: boolean; message?: ChatMessage; error?: string }) => {
      if (res.success && res.message) {
        queryClient.setQueryData(['messages', conversationId], (old: unknown) => {
          if (!old) return old;
          const data = old as { pages: Array<{ data: Array<{ clientId?: string }> }> };
          return {
            ...data,
            pages: data.pages.map((page, i: number) => {
              if (i !== 0) return page;
              return {
                ...page,
                data: page.data.map((m) =>
                  m.clientId === clientId ? { ...res.message, pending: false } : m,
                ),
              };
            }),
          };
        });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } else {
        queryClient.setQueryData(['messages', conversationId], (old: unknown) => {
          if (!old) return old;
          const data = old as { pages: Array<{ data: Array<{ clientId?: string }> }> };
          return {
            ...data,
            pages: data.pages.map((page, i: number) => {
              if (i !== 0) return page;
              return {
                ...page,
                data: page.data.map((m) =>
                  m.clientId === clientId ? { ...m, pending: false, failed: true } : m,
                ),
              };
            }),
          };
        });
      }
    };

    socket.emit('send_message', { conversationId, content, type: 'TEXT', clientId }, sendCallback);
  }, [text, pendingFile, conversationId, queryClient, user, uploadFile, resetUpload]);

  // ─── Edit message ──────────────────────────────────

  const handleSaveEdit = useCallback(() => {
    if (!editingMessage || !editText.trim()) return;

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit(
        'edit_message',
        { conversationId, messageId: editingMessage.id, content: editText.trim() },
        (res: { success: boolean }) => {
          if (res.success) {
            queryClient.setQueryData(['messages', conversationId], (old: unknown) => {
              if (!old) return old;
              const data = old as { pages: Array<{ data: Array<{ id: string }> }> };
              return {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  data: page.data.map((m) =>
                    m.id === editingMessage.id
                      ? { ...m, content: editText.trim(), isEdited: true, editedAt: new Date().toISOString() }
                      : m,
                  ),
                })),
              };
            });
            onCancelEdit?.();
            setEditText('');
          } else {
            antMessage.error('Failed to edit message');
          }
        },
      );
    }
  }, [editingMessage, editText, conversationId, queryClient, onCancelEdit]);

  const handleCancelEdit = () => {
    setEditText('');
    onCancelEdit?.();
  };

  // ─── File picker ───────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const err = validateFile(file);
    if (err) {
      antMessage.error(err);
      return;
    }

    setPendingFile(file);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = () => {
    setPendingFile(null);
    resetUpload();
  };

  // ─── Paste support ────────────────────────────────

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const err = validateFile(file);
          if (err) {
            antMessage.error(err);
            return;
          }
          setPendingFile(file);
        }
        return;
      }
    }
  };

  // ─── Emoji insert ──────────────────────────────────

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const current = isEditing ? editText : text;
        const newText = current.substring(0, start) + emoji + current.substring(end);
        if (isEditing) {
          setEditText(newText);
        } else {
          setText(newText);
        }
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
          textarea.focus();
        });
      } else {
        if (isEditing) {
          setEditText((prev) => prev + emoji);
        } else {
          setText((prev) => prev + emoji);
        }
      }
    },
    [isEditing, editText, text],
  );

  // ─── Typing indicator ─────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentText(e.target.value);

    if (!isEditing) {
      const socket = getSocket();
      if (socket) socket.emit('typing_start', { conversationId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        const s = getSocket();
        if (s) s.emit('typing_stop', { conversationId });
      }, 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isEditing) {
        handleSaveEdit();
      } else {
        handleSend();
      }
    }
    if (e.key === 'Escape' && isEditing) {
      handleCancelEdit();
    }
  };

  const canSend = isEditing
    ? editText.trim().length > 0
    : text.trim().length > 0 || !!pendingFile;

  return (
    <div className="border-t border-gray-200 bg-white">
      {/* Edit banner */}
      {isEditing && editingMessage && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 bg-blue-50 border-b border-blue-100">
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-blue-600">Editing message</span>
            <p className="text-xs text-gray-500 truncate">{editingMessage.content}</p>
          </div>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={handleCancelEdit} />
        </div>
      )}

      {/* Upload preview */}
      {pendingFile && (
        <UploadPreview
          file={pendingFile}
          progress={progress}
          uploading={uploading}
          error={uploadError}
          onCancel={cancelUpload}
          onRemove={handleRemoveFile}
        />
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        {!isEditing && (
          <>
            <Button
              type="text"
              icon={<PaperClipOutlined />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-shrink-0"
            />
            <EmojiPickerButton onSelect={handleEmojiSelect} />
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}

        <textarea
          ref={textareaRef}
          value={currentText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isEditing ? 'Edit message...' : 'Type a message...'}
          rows={1}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 max-h-32"
          style={{ minHeight: 38 }}
        />

        {isEditing ? (
          <div className="flex gap-1 flex-shrink-0">
            <Button size="small" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={handleSaveEdit}
              disabled={!editText.trim()}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button
            type="primary"
            shape="circle"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!canSend}
            loading={uploading}
          />
        )}
      </div>
    </div>
  );
}
