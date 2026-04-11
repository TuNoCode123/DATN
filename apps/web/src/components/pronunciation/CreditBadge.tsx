'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function CreditBadge() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    api
      .get('/credits')
      .then((res) => setBalance(res.data.balance))
      .catch(() => {});
  }, []);

  if (balance === null) return null;

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-bold border-2 border-black rounded-full bg-yellow-100 shadow-[2px_2px_0_0_#1e293b] whitespace-nowrap">
      <span>&#9733;</span>
      <span>{balance} credits</span>
    </div>
  );
}
