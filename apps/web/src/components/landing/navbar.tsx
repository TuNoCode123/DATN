'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { Menu, X, BookOpen } from 'lucide-react';

const navLinks = [
  { href: '/tests', label: 'Tests' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#about', label: 'About' },
];

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 hover:text-foreground transition-colors cursor-pointer"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop Auth */}
        <div className="hidden md:flex items-center gap-4">
          {isAuthenticated && user ? (
            <>
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
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-slate-600 hover:text-foreground py-2 cursor-pointer"
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t border-border pt-3 flex flex-col gap-2">
              {isAuthenticated && user ? (
                <>
                  <span className="text-sm font-medium text-foreground">
                    {user.displayName || user.email}
                  </span>
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
