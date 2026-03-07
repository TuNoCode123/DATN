'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Button, message } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      message.warning('Vui lòng nhập email và mật khẩu');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      const { data: user } = await api.get('/users/me');
      setUser(user);
      message.success('Đăng nhập thành công!');
      router.push('/tests');
    } catch {
      message.error('Email hoặc mật khẩu không đúng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-center mb-6">Đăng nhập</h1>
      <div className="flex flex-col gap-4">
        <Input
          size="large"
          placeholder="Email"
          prefix={<MailOutlined className="text-gray-400" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onPressEnter={handleLogin}
        />
        <Input.Password
          size="large"
          placeholder="Mật khẩu"
          prefix={<LockOutlined className="text-gray-400" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={handleLogin}
        />
        <Button
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleLogin}
        >
          Đăng nhập
        </Button>
        <p className="text-center text-sm text-gray-500">
          Chưa có tài khoản?{' '}
          <Link href="/register" className="text-blue-600 hover:underline">
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
