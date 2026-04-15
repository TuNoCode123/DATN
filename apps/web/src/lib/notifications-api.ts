import { api } from './api';

export type NotificationType = 'BROADCAST' | 'TARGETED' | 'SYSTEM';

export interface InboxItem {
  id: string;
  notificationId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface InboxPage {
  items: InboxItem[];
  nextCursor: string | null;
}

export interface AdminNotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  metadata: unknown;
  createdAt: string;
  createdBy: { id: string; displayName: string | null; email: string } | null;
  _count: { recipients: number };
}

export const notificationsApi = {
  listMine: (params: { cursor?: string; limit?: number; unreadOnly?: boolean }) =>
    api.get<InboxPage>('/notifications/me', { params }).then((r) => r.data),

  unreadCount: () =>
    api.get<{ count: number }>('/notifications/me/unread-count').then((r) => r.data),

  markRead: (id: string) =>
    api.patch(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    api.post('/notifications/me/read-all').then((r) => r.data),

  remove: (id: string) =>
    api.delete(`/notifications/${id}`).then((r) => r.data),
};

export const adminNotificationsApi = {
  list: (params: { cursor?: string; limit?: number }) =>
    api
      .get<{ items: AdminNotificationRow[]; nextCursor: string | null }>(
        '/admin/notifications',
        { params },
      )
      .then((r) => r.data),

  get: (id: string) =>
    api.get(`/admin/notifications/${id}`).then((r) => r.data),

  create: (data: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
    targetUserIds?: string[];
    metadata?: Record<string, unknown>;
  }) => api.post('/notifications', data).then((r) => r.data),
};
