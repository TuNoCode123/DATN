import Link from 'next/link';
import { BookOpen } from 'lucide-react';

const footerLinks = {
  Exams: [
    { href: '/ielts', label: 'IELTS' },
    { href: '/toeic', label: 'TOEIC' },
    { href: '/hsk', label: 'HSK' },
    { href: '/tests', label: 'All Tests' },
  ],
  'AI Tools': [
    { href: '/pronunciation', label: 'Pronunciation' },
    { href: '/flashcards', label: 'AI Flashcards' },
    { href: '/translation', label: 'AI Translator' },
    { href: '/live', label: 'Live Quiz' },
  ],
  Resources: [
    { href: '/blog', label: 'Blog' },
    { href: '/blog/how-to-get-ielts-band-7', label: 'IELTS Band 7 Guide' },
    { href: '/blog/toeic-900-listening-reading-strategy', label: 'TOEIC 900+ Guide' },
    { href: '/blog/hsk-levels-explained', label: 'HSK Levels' },
  ],
};

const linkClass =
  '!text-slate-600 hover:!text-primary text-sm font-medium cursor-pointer transition-colors';

export function Footer() {
  return (
    <footer className="bg-cream pt-16 pb-8 mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4 !text-foreground">
              <div className="w-10 h-10 bg-rose-100 border-[2.5px] border-border-strong rounded-xl flex items-center justify-center shadow-[2px_2px_0_0_var(--shadow-brutal)]">
                <BookOpen className="w-5 h-5 text-rose-600" />
              </div>
              <span className="text-xl font-bold text-foreground font-heading">
                NEU Study
              </span>
            </Link>
            <p className="text-slate-600 text-sm max-w-xs leading-relaxed">
              Empowering millions of learners worldwide with AI-powered
              preparation for IELTS, TOEIC, HSK and beyond.
            </p>
            {/* Social icons */}
            <div className="flex gap-3 mt-6">
              {['X', 'FB', 'IG', 'YT'].map((icon) => (
                <div
                  key={icon}
                  className="w-10 h-10 bg-white border-[2.5px] border-border-strong rounded-full flex items-center justify-center text-xs font-bold text-foreground cursor-pointer shadow-[2px_2px_0_0_var(--shadow-brutal)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_0_var(--shadow-brutal)] transition-transform"
                >
                  {icon}
                </div>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-bold text-foreground mb-4 text-sm uppercase tracking-wide">
                {title}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="border-t-2 border-dashed border-border-strong/30 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600 font-medium">
            &copy; 2026 NEU Study Platform. All rights reserved.
          </p>
          <div className="flex gap-6 text-xs">
            <Link href="#" className="!text-slate-600 hover:!text-foreground font-medium">
              Privacy
            </Link>
            <Link href="#" className="!text-slate-600 hover:!text-foreground font-medium">
              Terms
            </Link>
            <Link href="#" className="!text-slate-600 hover:!text-foreground font-medium">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
