'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Trash2 } from 'lucide-react';
import { notificationsApi, type InboxItem } from '@/lib/notifications-api';

export default function NotificationsInboxPage() {
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications', 'inbox', 'all', unreadOnly],
    queryFn: () => notificationsApi.listMine({ limit: 50, unreadOnly }),
  });

  const handleRead = async (id: string) => {
    await notificationsApi.markRead(id);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const handleAllRead = async () => {
    await notificationsApi.markAllRead();
    qc.invalidateQueries({ queryKey: ['notifications'] });
    refetch();
  };

  const handleDelete = async (id: string) => {
    await notificationsApi.remove(id);
    refetch();
  };

  const items = data?.items ?? [];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <Bell className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold">Notifications</h1>
            <p className="text-sm text-slate-500">All your updates in one place</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-border-strong cursor-pointer ${
              unreadOnly ? 'bg-indigo-100 text-indigo-800' : 'bg-white'
            }`}
          >
            {unreadOnly ? 'Showing unread' : 'Show all'}
          </button>
          <button
            onClick={handleAllRead}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-border-strong bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        </div>
      </div>

      <div className="brutal-card bg-white overflow-hidden divide-y divide-slate-100">
        {isLoading && (
          <div className="p-8 text-center text-sm text-slate-500">Loading...</div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">
            No notifications to show.
          </div>
        )}
        {items.map((n) => (
          <Row key={n.id} item={n} onRead={handleRead} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}

function Row({
  item,
  onRead,
  onDelete,
}: {
  item: InboxItem;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const unread = !item.readAt;
  const inner = (
    <div
      className={`p-4 flex items-start gap-4 ${unread ? 'bg-indigo-50/40' : ''}`}
    >
      <div
        className={`w-2.5 h-2.5 rounded-full mt-2 shrink-0 ${
          unread ? 'bg-indigo-500' : 'bg-transparent'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{item.title}</h3>
          <span className="text-xs text-slate-400 shrink-0">
            {new Date(item.createdAt).toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{item.body}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {unread && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRead(item.id);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-white"
            title="Mark as read"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (item.link) {
    return (
      <Link
        href={item.link}
        onClick={() => unread && onRead(item.id)}
        className="block hover:bg-slate-50 cursor-pointer"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
