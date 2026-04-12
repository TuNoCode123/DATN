import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2, Target, Mic, Sparkles } from 'lucide-react';
import { Navbar, Footer, SectionBadge, ExamCtaButton } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildMetadata,
  breadcrumbSchema,
  courseSchema,
  faqSchema,
} from '@/lib/seo';
import { HSK_LEVELS } from '@/content/hsk-levels';

export const metadata: Metadata = buildMetadata({
  title: 'HSK Preparation — Free Practice Tests & Vocabulary for HSK 1 to 6',
  description:
    'Prepare for HSK 1 to HSK 6 with free practice tests, official vocabulary lists, AI flashcards, and pinyin-aligned audio. Pick your level and start today.',
  path: '/hsk',
  keywords: [
    'hsk practice test',
    'hsk vocabulary',
    'hsk 1',
    'hsk 2',
    'hsk 3',
    'hsk 4',
    'hsk 5',
    'hsk 6',
    'learn chinese online',
    'hsk flashcards',
  ],
});

const hskFaqs = [
  {
    question: 'What is the HSK test?',
    answer:
      'HSK (Hanyu Shuiping Kaoshi) is the official standardized Chinese proficiency test administered by Hanban, covering six levels from beginner (HSK 1) to advanced (HSK 6).',
  },
  {
    question: 'Which HSK level should I take first?',
    answer:
      'If you are unsure, take our free HSK 2 practice test. If you score above 80%, jump to HSK 3. Most university exchange programs require HSK 3 or 4, and graduate programs require HSK 5.',
  },
  {
    question: 'How long does it take to reach HSK 4?',
    answer:
      'Roughly 1000 hours of study — about 2 years of regular classes or 1 year of intensive immersion. HSK 4 requires 1200 words of active vocabulary.',
  },
  {
    question: 'Are the HSK tests on NEU Study free?',
    answer:
      'Yes. Reading and Listening practice tests for all six HSK levels are free. Our AI writing evaluator and speaking practice use credits.',
  },
];

export default function HskPage() {
  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'HSK', path: '/hsk' },
          ]),
          courseSchema({
            name: 'HSK Preparation — Levels 1 to 6',
            description:
              'Complete HSK preparation for levels 1 through 6 with practice tests, vocabulary, and AI-powered study tools.',
            path: '/hsk',
          }),
          faqSchema(hskFaqs),
        ]}
      />
      <Navbar />

      {/* HERO */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <SectionBadge text="HSK 1 – HSK 6" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground mt-4 mb-6 leading-[1.1]">
            Master <span className="text-primary italic">HSK Chinese</span>{' '}
            from Level 1 to 6
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto mb-8 leading-relaxed">
            Practice tests, official vocabulary lists, AI flashcards, and
            pinyin-aligned audio for every HSK level. Start with the level you
            are on today and progress to fluency.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <ExamCtaButton
              authedHref="/tests?examType=HSK_2"
              className="brutal-btn bg-primary text-white px-7 py-3 text-sm inline-flex items-center gap-2"
            >
              Start Free HSK Practice <ArrowRight className="w-4 h-4" />
            </ExamCtaButton>
            <Link
              href="/blog/hsk-levels-explained"
              className="brutal-btn bg-secondary text-secondary-foreground px-7 py-3 text-sm"
            >
              HSK Levels Explained
            </Link>
          </div>
        </div>
      </section>

      {/* LEVEL GRID */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <SectionBadge text="All 6 Levels" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4 mb-3">
              Pick Your HSK Level
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Each level has its own vocabulary list, practice tests, and
              study roadmap. Every page works as a complete mini-course.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {HSK_LEVELS.map((l) => (
              <Link
                key={l.level}
                href={`/hsk/${l.level}`}
                className="brutal-card p-6 group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center min-w-[4.5rem] h-14 px-3 bg-primary text-white border-[2.5px] border-border-strong rounded-xl font-extrabold text-base whitespace-nowrap">
                    HSK {l.level}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 tabular-nums">
                    {l.vocabCount} words
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {l.level <= 2
                    ? 'Beginner'
                    : l.level <= 4
                      ? 'Intermediate'
                      : 'Advanced'}{' '}
                  Chinese
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-4 line-clamp-3">
                  {l.description}
                </p>
                <div className="flex items-center gap-2 text-primary font-semibold text-sm group-hover:gap-3 transition-all">
                  View HSK {l.level} <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <SectionBadge text="Why NEU Study for HSK" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4">
              The Fastest Path to Fluency
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              'Official HSK vocabulary split by level, with pinyin and tone marks',
              'Native audio recorded by mainland speakers for every word',
              'Character writing practice with stroke order animations',
              'AI flashcards that generate example sentences on demand',
            ].map((item) => (
              <div
                key={item}
                className="flex gap-3 bg-white border-2 border-border-strong rounded-xl p-4"
              >
                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-sm text-foreground font-medium">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RELATED */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-8">
            Other Exams & Tools
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { href: '/ielts', label: 'IELTS Prep', icon: Target },
              { href: '/toeic', label: 'TOEIC Prep', icon: Target },
              { href: '/pronunciation', label: 'AI Pronunciation', icon: Mic },
              { href: '/flashcards', label: 'AI Flashcards', icon: Sparkles },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="brutal-card p-5 flex items-center gap-3 hover:bg-secondary/40"
              >
                <l.icon className="w-5 h-5 text-primary" />
                <span className="font-semibold text-foreground">{l.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <SectionBadge text="FAQ" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4">
              HSK Questions, Answered
            </h2>
          </div>
          <div className="space-y-4">
            {hskFaqs.map((f) => (
              <div key={f.question} className="brutal-card p-5">
                <h3 className="font-bold text-foreground mb-2">{f.question}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {f.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
