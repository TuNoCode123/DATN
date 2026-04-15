'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import {
  connectNotificationsSocket,
  disconnectNotificationsSocket,
} from '@/lib/notifications-socket';
import { notificationsApi, type InboxItem } from '@/lib/notifications-api';

export function NotificationBell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const { data: inbox, refetch } = useQuery({
    queryKey: ['notifications', 'inbox', 'recent'],
    queryFn: () => notificationsApi.listMine({ limit: 10 }),
    enabled: isAuthenticated && open,
  });

  // Wire Socket.IO once authenticated.
  useEffect(() => {
    if (!isAuthenticated) {
      disconnectNotificationsSocket();
      return;
    }
    const socket = connectNotificationsSocket();
    const onNew = (_payload: InboxItem) => {
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'inbox'] });
    };
    const onCount = ({ count }: { count: number }) => {
      qc.setQueryData(['notifications', 'unread-count'], { count });
    };
    socket.on('notification:new', onNew);
    socket.on('notification:unread-count', onCount);
    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:unread-count', onCount);
    };
  }, [isAuthenticated, qc]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const count = unread?.count ?? 0;
  const items = useMemo(() => inbox?.items ?? [], [inbox]);

  const handleMarkRead = async (id: string) => {
    await notificationsApi.markRead(id);
    qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    refetch();
  };

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    qc.setQueryData(['notifications', 'unread-count'], { count: 0 });
    refetch();
  };

  if (!isAuthenticated) return null;

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl text-slate-600 hover:text-foreground hover:bg-slate-100 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-[360px] bg-white border-[2.5px] border-border-strong rounded-2xl shadow-[4px_4px_0px_#1E293B] overflow-hidden z-50">
          <div className="flex items-center justify-between p-3 border-b-2 border-border-strong">
            <h3 className="font-bold text-sm">Notifications</h3>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-slate-600 hover:text-foreground flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No notifications yet.
              </div>
            ) : (
              items.map((n) => (
                <InboxRow key={n.id} item={n} onRead={handleMarkRead} onClose={() => setOpen(false)} />
              ))
            )}
          </div>

          <div className="border-t-2 border-border-strong p-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block w-full text-center text-xs font-semibold text-slate-600 hover:text-foreground py-2"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function InboxRow({
  item,
  onRead,
  onClose,
}: {
  item: InboxItem;
  onRead: (id: string) => void;
  onClose: () => void;
}) {
  const unread = !item.readAt;
  const content = (
    <div
      className={`p-3 flex items-start gap-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
        unread ? 'bg-indigo-50/40' : ''
      }`}
    >
      <div
        className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
          unread ? 'bg-indigo-500' : 'bg-transparent'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-sm truncate">{item.title}</h4>
          <span className="text-[10px] text-slate-400 shrink-0">
            {formatTime(item.createdAt)}
          </span>
        </div>
        <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{item.body}</p>
      </div>
      {unread && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRead(item.id);
          }}
          className="text-slate-400 hover:text-foreground shrink-0"
          title="Mark as read"
        >
          <Check className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  if (item.link) {
    return (
      <Link
        href={item.link}
        onClick={() => {
          if (unread) onRead(item.id);
          onClose();
        }}
        className="block cursor-pointer"
      >
        {content}
      </Link>
    );
  }
  return <div className="cursor-pointer">{content}</div>;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}
