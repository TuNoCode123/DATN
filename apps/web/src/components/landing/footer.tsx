import Link from 'next/link';
import { BookOpen } from 'lucide-react';

const footerLinks = {
  Tests: [
    { href: '/tests', label: 'IELTS Tests' },
    { href: '/tests', label: 'Reading' },
    { href: '/tests', label: 'Listening' },
    { href: '/tests', label: 'Writing' },
  ],
  Company: [
    { href: '#about', label: 'About Us' },
    { href: '#', label: 'Careers' },
    { href: '#', label: 'Blog' },
    { href: '#', label: 'Press' },
  ],
  Support: [
    { href: '#', label: 'Help Center' },
    { href: '#', label: 'Contact' },
    { href: '#', label: 'Community' },
    { href: '#', label: 'FAQ' },
  ],
};

export function Footer() {
  return (
    <footer className="bg-cream pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4 cursor-pointer">
              <div className="w-10 h-10 bg-rose-100 border-2 border-border-strong rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-rose-600" />
              </div>
              <span className="text-xl font-bold text-foreground font-heading">
                IELTS AI
              </span>
            </Link>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
              Empowering millions of learners worldwide with AI-powered IELTS
              preparation accessible to everyone.
            </p>
            {/* Social icons */}
            <div className="flex gap-3 mt-6">
              {['X', 'FB', 'IG', 'YT'].map((icon) => (
                <div
                  key={icon}
                  className="w-10 h-10 bg-white border-2 border-border-strong rounded-full flex items-center justify-center text-xs font-bold text-foreground cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  {icon}
                </div>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-bold text-foreground mb-4 text-sm">{title}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-500 hover:text-primary transition-colors cursor-pointer"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            &copy; 2026 IELTS AI Platform. All rights reserved.
          </p>
          <div className="flex gap-6 text-xs text-slate-400">
            <Link href="#" className="hover:text-foreground cursor-pointer">Privacy</Link>
            <Link href="#" className="hover:text-foreground cursor-pointer">Terms</Link>
            <Link href="#" className="hover:text-foreground cursor-pointer">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
