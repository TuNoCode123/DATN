'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';
import {
  Menu,
  X,
  BookOpen,
  Coins,
  ChevronDown,
  Mic,
  Languages,
  Layers,
  Radio,
  LayoutDashboard,
  Sparkles,
  LogOut,
  Zap,
} from 'lucide-react';

type IconName =
  | 'tests'
  | 'flashcards'
  | 'live'
  | 'dashboard'
  | 'ai'
  | 'credits'
  | 'mic'
  | 'languages';

type NavLink =
  | { href: string; label: string; icon: IconName; color: string; badge?: 'live' }
  | {
      label: string;
      icon: IconName;
      color: string;
      children: { href: string; label: string; description?: string; icon?: 'mic' | 'languages' }[];
    };

const navLinks: NavLink[] = [
  { href: '/tests', label: 'Tests', icon: 'tests', color: 'sky' },
  { href: '/flashcards', label: 'Flashcards', icon: 'flashcards', color: 'violet' },
  { href: '/live', label: 'Live', icon: 'live', color: 'rose', badge: 'live' },
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', color: 'emerald' },
  {
    label: 'AI Tools',
    icon: 'ai',
    color: 'fuchsia',
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
  { href: '/credits', label: 'Credits', icon: 'credits', color: 'amber' },
];

const iconMap = {
  tests: BookOpen,
  flashcards: Layers,
  live: Radio,
  dashboard: LayoutDashboard,
  ai: Sparkles,
  credits: Coins,
  mic: Mic,
  languages: Languages,
};

const colorClasses: Record<string, { hover: string; active: string; text: string; iconBg: string }> = {
  sky:     { hover: 'hover:bg-sky-100',     active: 'bg-sky-100',     text: 'text-sky-700',     iconBg: 'bg-sky-200' },
  violet:  { hover: 'hover:bg-violet-100',  active: 'bg-violet-100',  text: 'text-violet-700',  iconBg: 'bg-violet-200' },
  rose:    { hover: 'hover:bg-rose-100',    active: 'bg-rose-100',    text: 'text-rose-700',    iconBg: 'bg-rose-200' },
  emerald: { hover: 'hover:bg-emerald-100', active: 'bg-emerald-100', text: 'text-emerald-700', iconBg: 'bg-emerald-200' },
  fuchsia: { hover: 'hover:bg-fuchsia-100', active: 'bg-fuchsia-100', text: 'text-fuchsia-700', iconBg: 'bg-fuchsia-200' },
  amber:   { hover: 'hover:bg-amber-100',   active: 'bg-amber-100',   text: 'text-amber-700',   iconBg: 'bg-amber-200' },
};

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const pathname = usePathname();
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

  const isActive = (href: string) => {
    if (href.startsWith('#')) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <header
      className={`fixed top-4 left-4 right-4 z-50 transition-all duration-200 ${
        scrolled ? 'top-2 left-2 right-2' : ''
      }`}
    >
      <nav className="max-w-7xl mx-auto bg-white border-[2.5px] border-border-strong rounded-2xl px-4 lg:px-5 py-2.5 flex items-center justify-between gap-3 shadow-[4px_4px_0px_#1E293B]">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 cursor-pointer shrink-0">
          <div className="relative w-10 h-10 bg-gradient-to-br from-rose-200 to-fuchsia-200 border-2 border-border-strong rounded-xl flex items-center justify-center shadow-[2px_2px_0_0_#1e293b]">
            <BookOpen className="w-5 h-5 text-rose-700" />
            <Sparkles className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-amber-500 fill-amber-300" />
          </div>
          <span className="text-xl font-bold font-heading bg-gradient-to-r from-rose-600 via-fuchsia-600 to-violet-600 bg-clip-text text-transparent">
            NEU Study
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = iconMap[link.icon];
            const c = colorClasses[link.color];
            const active = 'href' in link && isActive(link.href);

            if ('children' in link) {
              const anyChildActive = link.children.some((ch) => isActive(ch.href));
              return (
                <div key={link.label} className="relative group">
                  <span
                    tabIndex={0}
                    role="button"
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer select-none outline-none ${c.hover} ${
                      anyChildActive ? `${c.active} ${c.text}` : 'text-slate-700'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${anyChildActive ? c.text : 'text-slate-500'}`} />
                    {link.label}
                    <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-180" />
                  </span>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-72 h-3" aria-hidden />
                  <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 transition-all duration-200 ease-out z-50">
                    <div className="w-72 bg-white border-[2.5px] border-border-strong rounded-2xl p-2 shadow-[4px_4px_0px_#1E293B]">
                      {link.children.map((child) => {
                        const ChildIcon = child.icon === 'mic' ? Mic : Languages;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="flex items-start gap-3 p-3 rounded-xl hover:bg-fuchsia-50 transition-colors cursor-pointer"
                          >
                            <div className="w-9 h-9 shrink-0 bg-gradient-to-br from-fuchsia-100 to-rose-100 border-2 border-border-strong rounded-lg flex items-center justify-center">
                              <ChildIcon className="w-4 h-4 text-fuchsia-700" />
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
                className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${c.hover} ${
                  active ? `${c.active} ${c.text}` : 'text-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? c.text : 'text-slate-500'}`} />
                {link.label}
                {link.badge === 'live' && (
                  <span className="relative flex h-2 w-2 ml-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" />
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Desktop Auth */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          {isAuthenticated && user ? (
            <>
              {creditBalance !== null && (
                <Link
                  href="/credits"
                  title="Top up credits"
                  className="group inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 text-xs font-bold border-2 border-border-strong rounded-full bg-gradient-to-r from-amber-200 via-yellow-200 to-amber-200 shadow-[2px_2px_0_0_#1e293b] hover:shadow-[3px_3px_0_0_#1e293b] hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-yellow-400 border border-yellow-700/40">
                    <Coins className="w-3 h-3 text-yellow-900" />
                  </span>
                  <span className="text-amber-900 tabular-nums">{creditBalance.toLocaleString()}</span>
                  <Zap className="w-3 h-3 text-amber-700 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                </Link>
              )}
              <div className="flex items-center gap-2 px-2 py-1 rounded-full">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-200 to-fuchsia-200 border-2 border-border-strong flex items-center justify-center text-[11px] font-bold text-rose-800">
                  {(user.displayName || user.email).slice(0, 1).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-foreground max-w-[120px] truncate">
                  {user.displayName || user.email}
                </span>
              </div>
              <button
                onClick={() => {
                  logout();
                  window.location.href = '/login';
                }}
                title="Log out"
                className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-semibold text-foreground px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="brutal-btn bg-primary text-white px-5 py-2 text-sm"
              >
                Start Free
              </Link>
            </>
          )}
        </div>

        {/* Mobile credit + menu */}
        <div className="flex lg:hidden items-center gap-2">
          {isAuthenticated && creditBalance !== null && (
            <Link
              href="/credits"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold border-2 border-border-strong rounded-full bg-gradient-to-r from-amber-200 to-yellow-200 shadow-[2px_2px_0_0_#1e293b] cursor-pointer"
            >
              <Coins className="w-3.5 h-3.5 text-amber-700" />
              <span className="text-amber-900 tabular-nums">{creditBalance.toLocaleString()}</span>
            </Link>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 cursor-pointer"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-6 h-6 text-foreground" />
            ) : (
              <Menu className="w-6 h-6 text-foreground" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden mt-2 max-w-7xl mx-auto bg-white border-[2.5px] border-border-strong rounded-2xl px-4 py-4 shadow-[4px_4px_0px_#1E293B]">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const Icon = iconMap[link.icon];
              const c = colorClasses[link.color];
              if ('children' in link) {
                return (
                  <div key={link.label} className="flex flex-col">
                    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400 py-2 px-2">
                      <Icon className="w-3.5 h-3.5" />
                      {link.label}
                    </span>
                    {link.children.map((child) => {
                      const ChildIcon = child.icon === 'mic' ? Mic : Languages;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-foreground py-2 pl-6 cursor-pointer"
                        >
                          <ChildIcon className="w-4 h-4" />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              }
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 text-sm font-semibold px-3 py-2.5 rounded-xl cursor-pointer ${c.hover} ${
                    active ? `${c.active} ${c.text}` : 'text-slate-700'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? c.text : 'text-slate-500'}`} />
                  {link.label}
                  {link.badge === 'live' && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" />
                    </span>
                  )}
                </Link>
              );
            })}
            {isAuthenticated && (
              <Link
                href="/credits"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 text-sm font-semibold px-3 py-2.5 rounded-xl text-amber-700 hover:bg-amber-100 cursor-pointer"
              >
                <Coins className="w-4 h-4" />
                Credits
                {creditBalance !== null && (
                  <span className="ml-auto tabular-nums">{creditBalance.toLocaleString()}</span>
                )}
              </Link>
            )}
            <div className="border-t border-border pt-3 mt-2 flex flex-col gap-2">
              {isAuthenticated && user ? (
                <>
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-200 to-fuchsia-200 border-2 border-border-strong flex items-center justify-center text-xs font-bold text-rose-800">
                      {(user.displayName || user.email).slice(0, 1).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {user.displayName || user.email}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      window.location.href = '/login';
                    }}
                    className="flex items-center gap-2 text-sm text-red-500 text-left px-3 py-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-foreground px-3 py-2 cursor-pointer"
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
