'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Input, Button, Spin, Modal, App, Avatar } from 'antd';
import { PlusOutlined, SearchOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons';
import { useConversations, useCreateConversation } from '@/features/chat/hooks/use-chat';
import { ConversationItem } from './conversation-item';
import { CreateGroupModal } from './create-group-modal';
import { useChatStore } from '@/lib/chat-store';
import { api } from '@/lib/api';

interface UserResult {
  id: string;
  displayName: string | null;
  email: string;
}

export function ConversationList() {
  const { message } = App.useApp();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const { data, isLoading } = useConversations();
  const createConversation = useCreateConversation();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce conversation search (300ms)
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const conversations = data?.data || [];
  const filtered = debouncedSearch
    ? conversations.filter((c) => {
        const name =
          c.type === 'DIRECT'
            ? c.members[0]?.displayName || ''
            : c.name || '';
        return name.toLowerCase().includes(debouncedSearch.toLowerCase());
      })
    : conversations;

  const handleUserSearch = async (query: string) => {
    setUserSearch(query);
    if (query.length < 2) {
      setUserResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const { data } = await api.get('/users/search', { params: { q: query } });
      setUserResults(data || []);
    } catch {
      setUserResults([]);
    }
    setSearchingUsers(false);
  };

  const handleStartDM = async (targetUser: UserResult) => {
    try {
      const conv = await createConversation.mutateAsync({
        type: 'DIRECT',
        memberId: targetUser.id,
      });
      setActiveConversation(conv.id);
      setShowNewChat(false);
      setUserSearch('');
      setUserResults([]);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to start conversation');
    }
  };

  const closeNewChat = () => {
    setShowNewChat(false);
    setUserSearch('');
    setUserResults([]);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Messages</h2>
          <div className="flex gap-1">
            <Button
              size="small"
              icon={<MessageOutlined />}
              onClick={() => setShowNewChat(true)}
            >
              Chat
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setShowCreateGroup(true)}
            >
              Group
            </Button>
          </div>
        </div>
        <Input
          placeholder="Search conversations..."
          prefix={<SearchOutlined className="text-gray-400" />}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          allowClear
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Spin />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 p-8">
            {debouncedSearch ? 'No conversations found' : 'No conversations yet'}
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              onClick={() => setActiveConversation(conv.id)}
            />
          ))
        )}
      </div>

      {/* New Direct Chat Modal */}
      <Modal
        title="New Message"
        open={showNewChat}
        onCancel={closeNewChat}
        footer={null}
      >
        <div className="space-y-3">
          <Input.Search
            value={userSearch}
            onChange={(e) => handleUserSearch(e.target.value)}
            placeholder="Search by name or email..."
            loading={searchingUsers}
            autoFocus
          />
          {userResults.length > 0 && (
            <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              {userResults.map((u) => {
                const isOnline = !!onlineUsers[u.id];
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleStartDM(u)}
                  >
                    <div className="relative">
                      <Avatar size={36} icon={<UserOutlined />} className="bg-blue-500" />
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          isOnline ? 'bg-green-500' : 'bg-orange-500'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.displayName || u.email}</div>
                      <div className="text-xs text-gray-400 truncate">{u.email}</div>
                    </div>
                    <span className={`text-xs ${isOnline ? 'text-green-500' : 'text-orange-500'}`}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {userSearch.length >= 2 && userResults.length === 0 && !searchingUsers && (
            <div className="text-center text-gray-400 py-4 text-sm">No users found</div>
          )}
        </div>
      </Modal>

      <CreateGroupModal
        open={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
      />
    </div>
  );
}
