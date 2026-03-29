'use client';

import { useState } from 'react';
import { Drawer, Avatar, Button, App, Popconfirm, Input } from 'antd';
import { UserOutlined, LogoutOutlined, DeleteOutlined, CrownFilled, UserAddOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useRemoveMember, useAddMembers } from '@/features/chat/hooks/use-chat';
import { useChatStore } from '@/lib/chat-store';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  conversation: any;
}

interface UserResult {
  id: string;
  displayName: string | null;
  email: string;
}

export function GroupInfoDrawer({ open, onClose, conversation }: Props) {
  const { message } = App.useApp();
  const user = useAuthStore((s) => s.user);
  const removeMember = useRemoveMember();
  const addMembers = useAddMembers();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const onlineUsers = useChatStore((s) => s.onlineUsers);

  const [showAddMembers, setShowAddMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);

  const currentMember = conversation?.members?.find((m: any) => m.userId === user?.id);
  const isAdmin = currentMember?.role === 'ADMIN';
  const existingMemberIds = new Set(conversation?.members?.map((m: any) => m.userId) || []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await api.get('/users/search', { params: { q: query } });
      // Filter out users already in the group
      setSearchResults((data || []).filter((u: UserResult) => !existingMemberIds.has(u.id)));
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  const handleAddMembers = async () => {
    if (selectedUsers.length === 0) return;
    try {
      await addMembers.mutateAsync({
        conversationId: conversation.id,
        userIds: selectedUsers.map((u) => u.id),
      });
      message.success(`Added ${selectedUsers.length} member(s)`);
      setSelectedUsers([]);
      setSearchQuery('');
      setSearchResults([]);
      setShowAddMembers(false);
    } catch {
      message.error('Failed to add members');
    }
  };

  const handleLeave = async () => {
    if (!user) return;
    try {
      await removeMember.mutateAsync({
        conversationId: conversation.id,
        userId: user.id,
      });
      setActiveConversation(null);
      onClose();
      message.success('Left the group');
    } catch {
      message.error('Failed to leave group');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeMember.mutateAsync({
        conversationId: conversation.id,
        userId,
      });
      message.success('Member removed');
    } catch {
      message.error('Failed to remove member');
    }
  };

  return (
    <Drawer
      title={conversation?.name || 'Group Info'}
      open={open}
      onClose={onClose}
      width={320}
    >
      <div className="space-y-6">
        {/* Members */}
        <div>
          <h4 className="text-sm font-semibold text-gray-500 mb-3">
            Members ({conversation?.members?.length || 0})
          </h4>
          <div className="space-y-2">
            {conversation?.members?.map((member: any) => {
              const isOnline = !!onlineUsers[member.userId];
              return (
                <div key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Avatar
                        size={32}
                        icon={<UserOutlined />}
                        src={member.user?.avatarUrl}
                      />
                      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white rounded-full ${isOnline ? 'bg-green-500' : 'bg-orange-500'}`} />
                    </div>
                    <div>
                      <div className="text-sm flex items-center gap-1">
                        {member.user?.displayName || 'Unknown'}
                        {member.role === 'ADMIN' && (
                          <CrownFilled className="text-yellow-500 text-xs" />
                        )}
                        {member.userId === user?.id && (
                          <span className="text-xs text-gray-400">(you)</span>
                        )}
                      </div>
                      <div className={`text-xs ${isOnline ? 'text-green-500' : 'text-orange-500'}`}>
                        {isOnline ? 'Online' : 'Offline'}
                      </div>
                    </div>
                  </div>
                  {isAdmin && member.userId !== user?.id && (
                    <Popconfirm
                      title="Remove this member?"
                      onConfirm={() => handleRemove(member.userId)}
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                      />
                    </Popconfirm>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Members (admin only) */}
          {isAdmin && (
            <div className="mt-3">
              {!showAddMembers ? (
                <Button
                  type="dashed"
                  icon={<UserAddOutlined />}
                  block
                  onClick={() => setShowAddMembers(true)}
                >
                  Add Members
                </Button>
              ) : (
                <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
                  <Input.Search
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    loading={searching}
                    size="small"
                  />

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div className="border border-gray-200 rounded max-h-32 overflow-y-auto bg-white">
                      {searchResults.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                          onClick={() => {
                            if (!selectedUsers.find((s) => s.id === u.id)) {
                              setSelectedUsers([...selectedUsers, u]);
                            }
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                        >
                          <div>
                            <div className="font-medium">{u.displayName || u.email}</div>
                            <div className="text-xs text-gray-400">{u.email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Selected users */}
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedUsers.map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs"
                        >
                          {u.displayName || u.email}
                          <button
                            onClick={() => setSelectedUsers(selectedUsers.filter((s) => s.id !== u.id))}
                            className="text-blue-400 hover:text-blue-600 ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="small" onClick={() => { setShowAddMembers(false); setSelectedUsers([]); setSearchQuery(''); setSearchResults([]); }}>
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      onClick={handleAddMembers}
                      loading={addMembers.isPending}
                      disabled={selectedUsers.length === 0}
                    >
                      Add ({selectedUsers.length})
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Leave */}
        <Popconfirm title="Are you sure you want to leave?" onConfirm={handleLeave}>
          <Button danger icon={<LogoutOutlined />} block>
            Leave Group
          </Button>
        </Popconfirm>
      </div>
    </Drawer>
  );
}
