'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { App } from 'antd';
import { Radio } from 'lucide-react';
import { api } from '@/lib/api';

type SessionMeta = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdBy: { id: string; displayName: string | null; email: string };
};

export default function JoinBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const [joining, setJoining] = useState(false);

  const { data, isLoading, error } = useQuery<SessionMeta>({
    queryKey: ['live-exam-by-slug', slug],
    queryFn: async () => (await api.get(`/live-exams/by-slug/${slug}`)).data,
    retry: false,
  });

  const join = async () => {
    if (!data) return;
    setJoining(true);
    try {
      await api.post(`/live-exams/sessions/${data.id}/join`);
      router.push(`/live/sessions/${data.id}/lobby`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Could not join';
      message.error(msg);
    } finally {
      setJoining(false);
    }
  };

  if (isLoading) return <p>Loading…</p>;
  if (error || !data)
    return (
      <div className="brutal-card p-6 max-w-md mx-auto text-center">
        <h1 className="font-bold text-lg mb-2">Invite not found</h1>
        <p className="text-sm text-neutral-600">
          The link may have expired or the session was cancelled.
        </p>
      </div>
    );

  return (
    <div className="max-w-md mx-auto">
      <div className="brutal-card p-6 text-center">
        <Radio className="w-10 h-10 mx-auto text-green-600 mb-2" />
        <div className="text-xs uppercase font-bold text-neutral-500">
          Live exam invite
        </div>
        <h1 className="text-2xl font-extrabold mb-1">{data.title}</h1>
        {data.description && (
          <p className="text-sm text-neutral-600 mb-3">{data.description}</p>
        )}
        <div className="text-xs text-neutral-500 mb-6">
          Hosted by {data.createdBy.displayName ?? data.createdBy.email}
        </div>

        <button
          type="button"
          onClick={join}
          disabled={joining}
          className="brutal-btn-fill w-full py-3 text-lg disabled:opacity-50"
          data-testid="join-btn"
        >
          {joining ? 'Joining…' : 'Join room'}
        </button>
      </div>
    </div>
  );
}
