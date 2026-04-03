'use client';

import { useState, useMemo } from 'react';
import { Modal, Radio, Space } from 'antd';
import type { ChatMessage } from '@/lib/chat-store';

interface Props {
  open: boolean;
  message: ChatMessage | null;
  isOwn: boolean;
  onConfirm: (mode: 'self' | 'everyone') => void;
  onCancel: () => void;
}

export function DeleteMessageDialog({ open, message, isOwn, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<'self' | 'everyone'>('self');

  const canDeleteForEveryone = useMemo(() => {
    if (!message) return false;
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    return (
      isOwn &&
      message.type !== 'SYSTEM' &&
      new Date(message.createdAt).getTime() > now - 60 * 60 * 1000
    );
  }, [message, isOwn]);

  if (!message) return null;

  const handleOk = () => {
    onConfirm(mode);
    setMode('self');
  };

  const handleCancel = () => {
    onCancel();
    setMode('self');
  };

  return (
    <Modal
      title="Delete message?"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Delete"
      okButtonProps={{ danger: true }}
      width={360}
    >
      <Space direction="vertical" className="w-full mt-2">
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Space direction="vertical">
            <Radio value="self">Delete for me</Radio>
            {canDeleteForEveryone && (
              <Radio value="everyone">Delete for everyone</Radio>
            )}
          </Space>
        </Radio.Group>
        {mode === 'everyone' && (
          <p className="text-xs text-gray-400 ml-6">
            This message will be removed for all participants.
          </p>
        )}
      </Space>
    </Modal>
  );
}
