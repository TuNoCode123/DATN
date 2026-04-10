'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from 'antd';
import { Radio } from 'lucide-react';
import { api } from '@/lib/api';

export default function JoinByCodePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (code.length !== 6) {
      message.error('Join code is 6 digits');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/live-exams/by-code/${code}`);
      await api.post(`/live-exams/sessions/${data.id}/join`);
      router.push(`/live/sessions/${data.id}/lobby`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Could not join';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="brutal-card p-6 text-center">
        <Radio className="w-10 h-10 mx-auto text-green-600 mb-2" />
        <h1 className="text-2xl font-extrabold mb-1">Join a live exam</h1>
        <p className="text-sm text-neutral-600 mb-6">
          Enter the 6-digit code from your host.
        </p>

        <input
          type="tel"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          className="w-full text-center text-4xl tracking-[0.5em] font-mono font-extrabold border-2 border-black rounded-lg py-4 mb-4"
          data-testid="join-code-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') go();
          }}
        />

        <button
          type="button"
          onClick={go}
          disabled={loading || code.length !== 6}
          className="brutal-btn-fill w-full py-3 text-lg disabled:opacity-50"
          data-testid="join-btn"
        >
          {loading ? 'Joining…' : 'Join room'}
        </button>
      </div>
    </div>
  );
}
