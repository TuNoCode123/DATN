'use client';

import { Avatar, Badge } from 'antd';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import type { ChatConversation } from '@/lib/chat-store';
import { useChatStore } from '@/lib/chat-store';
import { useShallow } from 'zustand/react/shallow';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface Props {
  conversation: ChatConversation;
  isActive: boolean;
  onClick: () => void;
}

export function ConversationItem({ conversation, isActive, onClick }: Props) {
  const isGroup = conversation.type === 'GROUP';
  const displayName = isGroup
    ? conversation.name
    : conversation.members[0]?.displayName || 'Unknown';
  const otherUserId = !isGroup ? conversation.members[0]?.userId : null;
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const typingUsers = useChatStore(useShallow((s) => s.typingUsers[conversation.id] || []));
  const isOnline = otherUserId ? !!onlineUsers[otherUserId] : false;
  const groupOnlineCount = isGroup
    ? conversation.members.filter((m) => !!onlineUsers[m.userId]).length
    : 0;

  const lastMsg = conversation.lastMessage;
  let preview = '';
  if (lastMsg) {
    if (lastMsg.type === 'SYSTEM') {
      preview = lastMsg.content;
    } else {
      const sender = isGroup ? `${lastMsg.senderName}: ` : '';
      preview = `${sender}${lastMsg.content}`;
    }
  }

  // Show typing indicator in preview
  const isTyping = typingUsers.length > 0;
  const typingPreview = isTyping
    ? typingUsers.length === 1
      ? `${typingUsers[0].displayName} is typing...`
      : `${typingUsers.length} people typing...`
    : null;

  const timeStr = lastMsg ? dayjs(lastMsg.createdAt).fromNow() : '';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-150
        ${isActive
          ? 'bg-blue-50 border-r-[3px] border-blue-500'
          : 'hover:bg-gray-50 border-r-[3px] border-transparent'
        }`}
      onClick={onClick}
    >
      {/* Avatar with online status */}
      <Badge
        dot
        offset={[-4, 36]}
        style={{
          width: 10,
          height: 10,
          backgroundColor: isGroup
            ? (groupOnlineCount > 0 ? '#22c55e' : '#f97316')
            : (isOnline ? '#22c55e' : '#f97316'),
          boxShadow: '0 0 0 2px white',
        }}
      >
        <Avatar
          size={44}
          icon={isGroup ? <TeamOutlined /> : <UserOutlined />}
          src={isGroup ? conversation.avatarUrl : conversation.members[0]?.avatarUrl}
          className={isGroup ? 'bg-purple-500' : 'bg-blue-500'}
        />
      </Badge>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className={`font-medium text-sm truncate ${conversation.unreadCount > 0 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
            {displayName}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{timeStr}</span>
        </div>
        <div className="flex justify-between items-center mt-0.5">
          {isTyping ? (
            <span className="text-xs text-blue-500 truncate italic">{typingPreview}</span>
          ) : (
            <span className={`text-xs truncate ${conversation.unreadCount > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
              {preview || 'No messages yet'}
            </span>
          )}
          {conversation.unreadCount > 0 && (
            <Badge
              count={conversation.unreadCount}
              size="small"
              className="ml-2 flex-shrink-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
