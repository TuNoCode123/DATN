'use client';

import { Button, Tooltip } from 'antd';
import { SmileOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ChatMessage } from '@/lib/chat-store';

interface Props {
  message: ChatMessage;
  isOwn: boolean;
  onReact: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageActions({ message, isOwn, onReact, onEdit, onDelete }: Props) {
  if (message.deletedForAll || message.type === 'SYSTEM') return null;

  const canEdit = isOwn;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const canDeleteForEveryone = isOwn && new Date(message.createdAt).getTime() > oneHourAgo;

  return (
    <div className="absolute -top-3 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex bg-white border border-gray-200 rounded-lg shadow-sm z-10">
      <Tooltip title="React">
        <Button type="text" size="small" icon={<SmileOutlined />} onClick={onReact} className="!px-1.5" />
      </Tooltip>
      {canEdit && (
        <Tooltip title="Edit">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} className="!px-1.5" />
        </Tooltip>
      )}
      <Tooltip title="Delete">
        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={onDelete} className="!px-1.5 !text-red-400 hover:!text-red-500" />
      </Tooltip>
    </div>
  );
}
