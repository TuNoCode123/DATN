'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Button, message } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) {
      message.warning('Vui lòng nhập email và mật khẩu');
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
      message.success('Đăng ký thành công!');
      router.push('/tests');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Đăng ký thất bại';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-center mb-6">Tạo tài khoản</h1>
      <div className="flex flex-col gap-4">
        <Input
          size="large"
          placeholder="Tên hiển thị"
          prefix={<UserOutlined className="text-gray-400" />}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input
          size="large"
          placeholder="Email"
          prefix={<MailOutlined className="text-gray-400" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input.Password
          size="large"
          placeholder="Mật khẩu"
          prefix={<LockOutlined className="text-gray-400" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={handleRegister}
        />
        <Button
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleRegister}
        >
          Đăng ký
        </Button>
        <p className="text-center text-sm text-gray-500">
          Đã có tài khoản?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
