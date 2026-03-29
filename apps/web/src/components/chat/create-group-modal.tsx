'use client';

import { useState } from 'react';
import { Modal, Input, Button, App } from 'antd';
import { useCreateConversation } from '@/features/chat/hooks/use-chat';
import { useChatStore } from '@/lib/chat-store';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface UserResult {
  id: string;
  displayName: string | null;
  email: string;
}

export function CreateGroupModal({ open, onClose }: Props) {
  const { message } = App.useApp();
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);

  const createConversation = useCreateConversation();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await api.get('/users/search', { params: { q: query } });
      setSearchResults(data || []);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  const addMember = (user: UserResult) => {
    if (!selectedMembers.find((m) => m.id === user.id)) {
      setSelectedMembers([...selectedMembers, user]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeMember = (userId: string) => {
    setSelectedMembers(selectedMembers.filter((m) => m.id !== userId));
  };

  const handleCreate = async () => {
    if (!name.trim() || selectedMembers.length === 0) return;

    try {
      const conv = await createConversation.mutateAsync({
        type: 'GROUP',
        name: name.trim(),
        memberIds: selectedMembers.map((m) => m.id),
      });
      setActiveConversation(conv.id);
      message.success('Group created!');
      handleClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      message.error(axiosErr.response?.data?.message || 'Failed to create group');
    }
  };

  const handleClose = () => {
    setName('');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedMembers([]);
    onClose();
  };

  return (
    <Modal
      title="Create Group"
      open={open}
      onCancel={handleClose}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          Cancel
        </Button>,
        <Button
          key="create"
          type="primary"
          onClick={handleCreate}
          loading={createConversation.isPending}
          disabled={!name.trim() || selectedMembers.length === 0}
        >
          Create
        </Button>,
      ]}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Group Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter group name"
            maxLength={100}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Add Members</label>
          <Input.Search
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name or email..."
            loading={searching}
          />

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="mt-1 border border-gray-200 rounded max-h-40 overflow-y-auto">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => addMember(user)}
                >
                  <div>
                    <div className="text-sm font-medium">{user.displayName || user.email}</div>
                    <div className="text-xs text-gray-400">{user.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected members */}
        {selectedMembers.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-700">
              Members ({selectedMembers.length})
            </label>
            <div className="flex flex-wrap gap-2 mt-1">
              {selectedMembers.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs"
                >
                  {m.displayName || m.email}
                  <button
                    onClick={() => removeMember(m.id)}
                    className="text-blue-400 hover:text-blue-600 ml-1"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
