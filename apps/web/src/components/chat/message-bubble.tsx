'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Avatar, Badge } from 'antd';
import { UserOutlined, StopOutlined } from '@ant-design/icons';
import type { ChatMessage } from '@/lib/chat-store';
import { useChatStore } from '@/lib/chat-store';
import { FileIcon } from './file-icon';
import { MessageActions } from './message-actions';
import { MessageReactions } from './message-reactions';
import { ReactionPicker } from './reaction-picker';
import { ImageLightbox } from './image-lightbox';
import { formatBytes } from '@/lib/format-bytes';
import dayjs from 'dayjs';

interface Props {
  message: ChatMessage;
  isOwn: boolean;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  onReaction?: (messageId: string, emoji: string) => void;
}

export function MessageBubble({ message, isOwn, onEdit, onDelete, onReaction }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

  const isSenderOnline = useChatStore((s) =>
    message.senderId ? !!s.onlineUsers[message.senderId] : false,
  );

  // SYSTEM message
  if (message.type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  // Deleted for everyone
  if (message.deletedForAll) {
    return (
      <div className={`flex items-end gap-2 mb-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
        {!isOwn && <SenderAvatar message={message} isOnline={isSenderOnline} />}
        <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
          <div className="inline-block px-3 py-2 rounded-2xl text-sm bg-gray-50 border border-gray-200 rounded-bl-md">
            <span className="text-gray-400 italic flex items-center gap-1">
              <StopOutlined className="text-xs" />
              This message was deleted
            </span>
          </div>
          <div className={`text-[10px] text-gray-400 mt-0.5 ${isOwn ? 'text-right mr-1' : 'ml-1'}`}>
            {dayjs(message.createdAt).format('HH:mm')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`flex items-end gap-2 mb-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
        {!isOwn && <SenderAvatar message={message} isOnline={isSenderOnline} />}
        <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} relative group`}>
          {/* Action bar (hover) */}
          <MessageActions
            message={message}
            isOwn={isOwn}
            onReact={() => setReactionPickerOpen(true)}
            onEdit={() => onEdit?.(message)}
            onDelete={() => onDelete?.(message)}
          />

          {!isOwn && message.sender?.displayName && (
            <span className="text-xs text-gray-500 ml-1 mb-0.5 block">
              {message.sender.displayName}
            </span>
          )}

          {/* Bubble + reactions wrapper */}
          <div className={`relative ${message.reactions?.length ? 'mb-3' : ''}`}>
            {/* Reaction picker - attached just above the bubble */}
            {reactionPickerOpen && (
              <div className={`absolute bottom-full ${isOwn ? 'right-0' : 'left-0'} z-20 mb-[5px]`}>
                <ReactionPicker
                  open={reactionPickerOpen}
                  onSelect={(emoji) => onReaction?.(message.id, emoji)}
                  onClose={() => setReactionPickerOpen(false)}
                >
                  <span />
                </ReactionPicker>
              </div>
            )}
            <div
              className={`inline-block rounded-2xl text-sm break-words ${
                isOwn
                  ? 'bg-blue-500 text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              } ${message.pending ? 'opacity-60' : ''} ${message.failed ? 'border border-red-300' : ''}`}
            >
              {/* IMAGE content */}
              {message.type === 'IMAGE' && message.attachmentUrl && (
                <Image
                  src={message.attachmentUrl}
                  alt={message.attachmentName || 'Image'}
                  width={300}
                  height={400}
                  sizes="300px"
                  className="max-w-[300px] max-h-[400px] object-cover rounded-t-2xl cursor-pointer"
                  style={{ width: 'auto', height: 'auto', maxWidth: '300px', maxHeight: '400px' }}
                  onClick={() => setLightboxOpen(true)}
                />
              )}

              {/* FILE content */}
              {message.type === 'FILE' && message.attachmentUrl && (
                <div className="flex items-center gap-3 px-3 py-2 min-w-[200px]">
                  <FileIcon mimeType={message.attachmentType || ''} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                      {message.attachmentName || 'File'}
                    </p>
                    <p className={`text-xs ${isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
                      {message.attachmentSize ? formatBytes(message.attachmentSize) : ''}
                    </p>
                  </div>
                  <a
                    href={message.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs underline flex-shrink-0 ${isOwn ? 'text-blue-100 hover:text-white' : 'text-blue-500 hover:text-blue-600'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download
                  </a>
                </div>
              )}

              {/* Text content / caption */}
              {message.content && (
                <div className="px-3 py-2">
                  {message.content}
                </div>
              )}

              {/* Empty padding for image-only messages without caption */}
              {!message.content && message.type !== 'FILE' && message.type !== 'IMAGE' && (
                <div className="px-3 py-2">{message.content}</div>
              )}
            </div>

            {/* Reactions - anchored to bottom-left of bubble */}
            {message.reactions && message.reactions.length > 0 && (
              <div className={`absolute -bottom-2.5 ${isOwn ? 'right-1' : 'left-1'} z-10`}>
                <MessageReactions
                  reactions={message.reactions}
                  onToggle={(emoji) => onReaction?.(message.id, emoji)}
                />
              </div>
            )}
          </div>

          {/* Timestamp + edited label */}
          <div className={`text-[10px] text-gray-400 mt-0.5 flex items-center gap-1 ${isOwn ? 'justify-end mr-1' : 'ml-1'}`}>
            {dayjs(message.createdAt).format('HH:mm')}
            {message.isEdited && <span className="italic">(edited)</span>}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && message.attachmentUrl && (
        <ImageLightbox
          src={message.attachmentUrl}
          alt={message.attachmentName || undefined}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

function SenderAvatar({ message, isOnline }: { message: ChatMessage; isOnline: boolean }) {
  return (
    <Badge
      dot
      offset={[-2, 22]}
      style={{
        width: 8,
        height: 8,
        backgroundColor: isOnline ? '#22c55e' : '#f97316',
        boxShadow: '0 0 0 1.5px white',
      }}
    >
      <Avatar
        size={28}
        icon={<UserOutlined />}
        src={message.sender?.avatarUrl}
        className="bg-gray-400 flex-shrink-0"
      />
    </Badge>
  );
}
