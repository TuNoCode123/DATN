'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from 'antd';
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

export default function RegisterPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) {
      message.warning('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        email,
        password,
        displayName: displayName || undefined,
      });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      const { data: user } = await api.get('/users/me');
      setUser(user);
      message.success('Account created successfully!');
      router.push('/tests');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Registration failed';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-center text-foreground mb-2">
        Create Account
      </h1>
      <p className="text-sm text-slate-500 text-center mb-8">
        Start your IELTS preparation journey today
      </p>

      <div className="flex flex-col gap-4">
        {/* Display Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
            Display Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="name"
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:ring-0 outline-none bg-white transition-colors"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:ring-0 outline-none bg-white transition-colors"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:ring-0 outline-none bg-white transition-colors"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleRegister}
          disabled={loading}
          className="brutal-btn bg-primary text-white py-3 text-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Create Account
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-500 mt-2">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline cursor-pointer">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
