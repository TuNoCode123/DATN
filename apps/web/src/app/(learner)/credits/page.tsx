'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Coins, Check, Clock, AlertCircle, Sparkles, Zap, TrendingUp } from 'lucide-react';

interface CreditPackage {
  id: string;
  name: string;
  description: string | null;
  priceUsd: string;
  baseCredits: number;
  bonusCredits: number;
  sortOrder: number;
}

interface PaymentOrder {
  id: string;
  status: 'CREATED' | 'APPROVED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
  providerOrderId: string;
  amountUsd: string;
  creditsGranted: number;
  createdAt: string;
  capturedAt: string | null;
  package: { id: string; name: string; baseCredits: number; bonusCredits: number };
}

const STATUS_STYLES: Record<PaymentOrder['status'], string> = {
  CREATED: 'bg-slate-100 text-slate-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  CAPTURED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-amber-100 text-amber-700',
};

export default function CreditsPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '';

  const packagesQuery = useQuery({
    queryKey: ['credit-packages'],
    queryFn: async () => {
      const res = await api.get<{ packages: CreditPackage[] }>('/payments/packages');
      return res.data.packages;
    },
  });

  const balanceQuery = useQuery({
    queryKey: ['credit-balance'],
    queryFn: async () => {
      const res = await api.get<{ balance: number }>('/credits');
      return res.data.balance;
    },
    enabled: isAuthenticated,
  });

  const historyQuery = useQuery({
    queryKey: ['payment-history'],
    queryFn: async () => {
      const res = await api.get<{ items: PaymentOrder[]; total: number }>(
        '/payments/history?limit=10',
      );
      return res.data;
    },
    enabled: isAuthenticated,
  });

  const packages = packagesQuery.data ?? [];
  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === selectedPackageId) ?? null,
    [packages, selectedPackageId],
  );

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['credit-balance'] });
    queryClient.invalidateQueries({ queryKey: ['payment-history'] });
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground font-heading">Credits</h1>
          <p className="text-sm text-slate-600 mt-1">
            Top up credits to unlock AI features: pronunciation, grading, chat, translation & more.
          </p>
        </div>
        <div className="brutal-card bg-gradient-to-br from-yellow-100 to-amber-200 px-4 sm:px-5 py-3 inline-flex items-center gap-3 self-start sm:self-auto">
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-border-strong flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5 text-yellow-900" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-yellow-800">Balance</div>
            <div className="text-2xl sm:text-3xl font-bold text-yellow-900 leading-none tabular-nums">
              {balanceQuery.isLoading ? '…' : (balanceQuery.data ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`brutal-card px-4 py-3 flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-emerald-100' : 'bg-red-100'
          }`}
        >
          {toast.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-700" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-700" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Package Grid */}
      <section>
        <h2 className="text-xl font-bold text-foreground mb-4">Choose a package</h2>
        {packagesQuery.isLoading ? (
          <div className="text-slate-500">Loading packages…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {packages.map((pkg) => {
              const total = pkg.baseCredits + pkg.bonusCredits;
              const isSelected = selectedPackageId === pkg.id;
              const isBestValue = pkg.sortOrder === 5;
              const perDollar = Math.round(total / Math.max(1, parseFloat(pkg.priceUsd)));
              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className={`brutal-card text-left p-5 transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-rose-100 translate-x-[-2px] translate-y-[-2px]'
                      : isBestValue
                        ? 'bg-gradient-to-br from-fuchsia-50 to-rose-50'
                        : 'bg-white'
                  }`}
                >
                  {isBestValue && (
                    <div className="absolute -top-3 left-4 bg-primary text-white text-[10px] font-bold uppercase px-2 py-1 border-2 border-border-strong rounded flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Best Value
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute -top-3 right-4 bg-emerald-400 text-emerald-900 text-[10px] font-bold uppercase px-2 py-1 border-2 border-border-strong rounded flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Selected
                    </div>
                  )}
                  <div className="text-xs font-bold uppercase text-slate-500">{pkg.name}</div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold">${pkg.priceUsd}</span>
                    <span className="text-xs text-slate-500">USD</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-yellow-600" />
                    <span className="text-lg font-bold tabular-nums">{total.toLocaleString()}</span>
                    <span className="text-xs text-slate-500">credits</span>
                  </div>
                  {pkg.bonusCredits > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                      <Sparkles className="w-3 h-3" />+{pkg.bonusCredits.toLocaleString()} bonus
                    </div>
                  )}
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                    <Zap className="w-3 h-3" />
                    {perDollar.toLocaleString()} credits / $1
                  </div>
                  {pkg.description && (
                    <p className="mt-3 text-xs text-slate-500 line-clamp-2">{pkg.description}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Checkout */}
      <section>
        <h2 className="text-xl font-bold text-foreground mb-4">Checkout</h2>
        {!selectedPackage ? (
          <div className="brutal-card bg-white p-6 text-center text-slate-500">
            Select a package above to continue.
          </div>
        ) : !paypalClientId ? (
          <div className="brutal-card bg-amber-100 p-6">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertCircle className="w-5 h-5" />
              PayPal not configured
            </div>
            <p className="text-sm text-amber-800 mt-2">
              Set <code>NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> in <code>apps/web/.env.local</code> and
              restart the dev server.
            </p>
          </div>
        ) : (
          <div className="brutal-card bg-white p-6 max-w-md">
            <div className="mb-4">
              <div className="text-xs font-bold uppercase text-slate-500">You'll receive</div>
              <div className="text-2xl font-bold">
                {(selectedPackage.baseCredits + selectedPackage.bonusCredits).toLocaleString()} credits
              </div>
              <div className="text-sm text-slate-500">for ${selectedPackage.priceUsd} USD</div>
            </div>
            <PayPalScriptProvider
              options={{ clientId: paypalClientId, currency: 'USD', intent: 'capture' }}
            >
              <PayPalButtons
                key={selectedPackage.id}
                style={{ layout: 'vertical', shape: 'rect', label: 'paypal' }}
                createOrder={async () => {
                  const res = await api.post<{ providerOrderId: string }>(
                    '/payments/paypal/orders',
                    { packageId: selectedPackage.id },
                  );
                  return res.data.providerOrderId;
                }}
                onApprove={async (data) => {
                  try {
                    const res = await api.post<{
                      status: string;
                      creditsGranted: number;
                      balance: number;
                    }>(`/payments/paypal/orders/${data.orderID}/capture`);
                    showToast(
                      'success',
                      `+${res.data.creditsGranted} credits added. Balance: ${res.data.balance}`,
                    );
                    setSelectedPackageId(null);
                    refreshAll();
                  } catch (err: any) {
                    showToast('error', err?.response?.data?.message || 'Capture failed');
                  }
                }}
                onError={(err) => {
                  const message =
                    err && typeof err === 'object' && 'message' in err
                      ? String((err as { message: unknown }).message)
                      : 'PayPal error';
                  showToast('error', message);
                }}
                onCancel={() => showToast('error', 'Payment cancelled')}
              />
            </PayPalScriptProvider>
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="text-xl font-bold text-foreground mb-4">Purchase history</h2>
        <div className="brutal-card bg-white overflow-hidden">
          {historyQuery.isLoading ? (
            <div className="p-6 text-slate-500">Loading…</div>
          ) : !historyQuery.data?.items.length ? (
            <div className="p-6 text-slate-500 text-center">No purchases yet.</div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden sm:table w-full text-sm">
                <thead className="bg-slate-50 border-b-2 border-border-strong">
                  <tr>
                    <th className="text-left px-4 py-2 font-bold">Date</th>
                    <th className="text-left px-4 py-2 font-bold">Package</th>
                    <th className="text-left px-4 py-2 font-bold">Amount</th>
                    <th className="text-left px-4 py-2 font-bold">Credits</th>
                    <th className="text-left px-4 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.items.map((order) => (
                    <tr key={order.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {new Date(order.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">{order.package.name}</td>
                      <td className="px-4 py-3">${order.amountUsd}</td>
                      <td className="px-4 py-3 font-bold tabular-nums">
                        {order.status === 'CAPTURED' ? `+${order.creditsGranted.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[11px] font-bold uppercase px-2 py-1 rounded border border-border-strong ${
                            STATUS_STYLES[order.status]
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <ul className="sm:hidden divide-y-2 divide-slate-100">
                {historyQuery.data.items.map((order) => (
                  <li key={order.id} className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-foreground">{order.package.name}</div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-1 rounded border border-border-strong shrink-0 ${
                          STATUS_STYLES[order.status]
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                      <span className="font-bold text-slate-800">${order.amountUsd}</span>
                    </div>
                    {order.status === 'CAPTURED' && (
                      <div className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
                        <Coins className="w-3.5 h-3.5" />
                        +{order.creditsGranted.toLocaleString()} credits
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
