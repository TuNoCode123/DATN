'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { Menu, X, BookOpen, Coins, ChevronDown, Mic, Languages } from 'lucide-react';

type NavLink =
  | { href: string; label: string }
  | {
      label: string;
      children: { href: string; label: string; description?: string; icon?: 'mic' | 'languages' }[];
    };

const navLinks: NavLink[] = [
  { href: '/tests', label: 'Tests' },
  { href: '/flashcards', label: 'Flashcards' },
  { href: '/dashboard', label: 'Dashboard' },
  {
    label: 'AI Tools',
    children: [
      {
        href: '/pronunciation',
        label: 'Pronunciation',
        description: 'Practice speaking with AI feedback',
        icon: 'mic',
      },
      {
        href: '/translation',
        label: 'Translation',
        description: 'Translate between languages',
        icon: 'languages',
      },
    ],
  },
  { href: '#about', label: 'About' },
];

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      api.get('/credits').then((res) => setCreditBalance(res.data.balance)).catch(() => {});
    }
  }, [isAuthenticated]);

  return (
    <header
      className={`fixed top-4 left-4 right-4 z-50 transition-all duration-200 ${
        scrolled ? 'top-2 left-2 right-2' : ''
      }`}
    >
      <nav className="max-w-7xl mx-auto bg-white border-[2.5px] border-border-strong rounded-2xl px-6 py-3 flex items-center justify-between shadow-[4px_4px_0px_#1E293B]">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 cursor-pointer">
          <div className="w-10 h-10 bg-rose-100 border-2 border-border-strong rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-rose-600" />
          </div>
          <span className="text-xl font-bold text-foreground font-heading">
            IELTS AI
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => {
            if ('children' in link) {
              return (
                <div key={link.label} className="relative group">
                  <span
                    tabIndex={0}
                    role="button"
                    className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-foreground transition-colors cursor-pointer select-none outline-none"
                  >
                    {link.label}
                    <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-180" />
                  </span>
                  {/* Invisible bridge so dropdown stays open while moving cursor */}
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-72 h-3" aria-hidden />
                  <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 transition-all duration-200 ease-out">
                    <div className="w-72 bg-white border-[2.5px] border-border-strong rounded-2xl p-2 shadow-[4px_4px_0px_#1E293B]">
                      {link.children.map((child) => {
                        const Icon = child.icon === 'mic' ? Mic : Languages;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="flex items-start gap-3 p-3 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <div className="w-9 h-9 shrink-0 bg-rose-100 border-2 border-border-strong rounded-lg flex items-center justify-center">
                              <Icon className="w-4 h-4 text-rose-600" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-foreground">{child.label}</span>
                              {child.description && (
                                <span className="text-xs text-slate-500">{child.description}</span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-slate-600 hover:text-foreground transition-colors cursor-pointer"
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Desktop Auth */}
        <div className="hidden md:flex items-center gap-4">
          {isAuthenticated && user ? (
            <>
              {creditBalance !== null && (
                <div className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold border-2 border-border-strong rounded-full bg-yellow-100 shadow-[2px_2px_0_0_#1e293b]">
                  <Coins className="w-3.5 h-3.5 text-yellow-600" />
                  <span>{creditBalance}</span>
                </div>
              )}
              <span className="text-sm font-medium text-foreground">
                {user.displayName || user.email}
              </span>
              <button
                onClick={() => {
                  logout();
                  window.location.href = '/login';
                }}
                className="text-sm text-slate-500 hover:text-red-500 transition-colors cursor-pointer"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="brutal-btn bg-primary text-white px-6 py-2.5 text-sm"
              >
                Start Free
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 cursor-pointer"
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="w-6 h-6 text-foreground" />
          ) : (
            <Menu className="w-6 h-6 text-foreground" />
          )}
        </button>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden mt-2 max-w-7xl mx-auto bg-white border-[2.5px] border-border-strong rounded-2xl px-6 py-4 shadow-[4px_4px_0px_#1E293B]">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => {
              if ('children' in link) {
                return (
                  <div key={link.label} className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400 py-2">
                      {link.label}
                    </span>
                    {link.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className="text-sm font-medium text-slate-600 hover:text-foreground py-2 pl-3 cursor-pointer"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                );
              }
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-slate-600 hover:text-foreground py-2 cursor-pointer"
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="border-t border-border pt-3 flex flex-col gap-2">
              {isAuthenticated && user ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {user.displayName || user.email}
                    </span>
                    {creditBalance !== null && (
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold border-2 border-border-strong rounded-full bg-yellow-100 shadow-[2px_2px_0_0_#1e293b]">
                        <Coins className="w-3.5 h-3.5 text-yellow-600" />
                        <span>{creditBalance}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      window.location.href = '/login';
                    }}
                    className="text-sm text-red-500 text-left cursor-pointer"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-foreground cursor-pointer"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/register"
                    className="brutal-btn bg-primary text-white px-6 py-2.5 text-sm text-center"
                  >
                    Start Free
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
