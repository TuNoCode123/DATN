'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Send, Users, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/admin/page-header';
import {
  adminNotificationsApi,
  type NotificationType,
  type AdminNotificationRow,
} from '@/lib/notifications-api';

export default function AdminNotificationsPage() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: () => adminNotificationsApi.list({ limit: 50 }),
  });

  const createMutation = useMutation({
    mutationFn: adminNotificationsApi.create,
    onSuccess: () => {
      toast.success('Notification queued for delivery');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create notification';
      toast.error(msg);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Notifications"
        description="Broadcast messages to users in real time"
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Send className="w-4 h-4 mr-2" />
              Compose
            </Button>
          </DialogTrigger>
          <ComposeDialog
            onSubmit={(data) => createMutation.mutate(data)}
            submitting={createMutation.isPending}
          />
        </Dialog>
      </PageHeader>

      <div className="border rounded-lg divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading...</div>}
        {!isLoading && (data?.items?.length ?? 0) === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No notifications sent yet.</div>
        )}
        {data?.items?.map((n) => <NotificationRow key={n.id} n={n} />)}
      </div>
    </div>
  );
}

function NotificationRow({ n }: { n: AdminNotificationRow }) {
  return (
    <div className="p-4 flex items-start gap-4 hover:bg-muted/30">
      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
        {n.type === 'BROADCAST' ? (
          <Globe className="w-5 h-5 text-indigo-600" />
        ) : n.type === 'TARGETED' ? (
          <Users className="w-5 h-5 text-indigo-600" />
        ) : (
          <Bell className="w-5 h-5 text-indigo-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-sm">{n.title}</h3>
          <Badge variant="outline" className="text-[10px]">
            {n.type}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{n.body}</p>
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-3">
          <span>{new Date(n.createdAt).toLocaleString()}</span>
          <span>•</span>
          <span>{n._count.recipients} recipients</span>
          {n.createdBy && (
            <>
              <span>•</span>
              <span>by {n.createdBy.displayName ?? n.createdBy.email}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ComposeDialog({
  onSubmit,
  submitting,
}: {
  onSubmit: (data: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
    targetUserIds?: string[];
  }) => void;
  submitting: boolean;
}) {
  const [type, setType] = useState<NotificationType>('BROADCAST');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [targetUserIds, setTargetUserIds] = useState('');

  const handleSubmit = () => {
    if (!title.trim() || !body.trim()) return;
    onSubmit({
      type,
      title: title.trim(),
      body: body.trim(),
      link: link.trim() || undefined,
      targetUserIds:
        type === 'TARGETED'
          ? targetUserIds
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New Notification</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">Type</label>
          <Select value={type} onValueChange={(v) => setType(v as NotificationType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BROADCAST">Broadcast (all users)</SelectItem>
              <SelectItem value="TARGETED">Targeted (specific users)</SelectItem>
              <SelectItem value="SYSTEM">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New feature released"
            maxLength={200}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Body</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body"
            rows={4}
            maxLength={2000}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Link (optional)</label>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/tests/123 or https://..."
          />
        </div>
        {type === 'TARGETED' && (
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Target user IDs (comma or whitespace separated)
            </label>
            <Textarea
              value={targetUserIds}
              onChange={(e) => setTargetUserIds(e.target.value)}
              placeholder="userId1, userId2"
              rows={3}
            />
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit} disabled={submitting || !title.trim() || !body.trim()}>
          {submitting ? 'Sending...' : 'Send'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
