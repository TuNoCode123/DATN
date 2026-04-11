import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, Clock, BookOpen, Sparkles } from 'lucide-react';
import { Navbar, Footer, SectionBadge, ExamCtaButton } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildMetadata,
  breadcrumbSchema,
  courseSchema,
} from '@/lib/seo';
import { HSK_LEVELS, getHskLevel } from '@/content/hsk-levels';

type Params = { level: string };

export function generateStaticParams(): Params[] {
  return HSK_LEVELS.map((l) => ({ level: String(l.level) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { level } = await params;
  const hsk = getHskLevel(Number(level));
  if (!hsk) return {};

  return buildMetadata({
    title: `HSK ${hsk.level} Vocabulary & Practice Test — ${hsk.vocabCount} Words`,
    description: `Complete HSK ${hsk.level} guide: ${hsk.vocabCount} vocabulary words, exam format, free practice tests, sample characters, and a study plan to pass HSK ${hsk.level}.`,
    path: `/hsk/${hsk.level}`,
    keywords: [
      `hsk ${hsk.level}`,
      `hsk ${hsk.level} vocabulary`,
      `hsk ${hsk.level} practice test`,
      `hsk ${hsk.level} word list`,
      `learn chinese hsk ${hsk.level}`,
    ],
  });
}

export default async function HskLevelPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { level } = await params;
  const hsk = getHskLevel(Number(level));
  if (!hsk) notFound();

  const prev = hsk.level > 1 ? hsk.level - 1 : null;
  const next = hsk.level < 6 ? hsk.level + 1 : null;

  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'HSK', path: '/hsk' },
            { name: `HSK ${hsk.level}`, path: `/hsk/${hsk.level}` },
          ]),
          courseSchema({
            name: `HSK ${hsk.level} Preparation`,
            description: hsk.description,
            path: `/hsk/${hsk.level}`,
          }),
        ]}
      />
      <Navbar />

      {/* HERO */}
      <section className="pt-32 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <nav className="text-xs text-slate-500 mb-4 flex gap-2 items-center">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link href="/hsk" className="hover:text-primary">HSK</Link>
            <span>/</span>
            <span className="text-foreground font-semibold">HSK {hsk.level}</span>
          </nav>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-primary text-white border-[2.5px] border-border-strong rounded-xl flex items-center justify-center font-extrabold text-xl shadow-[4px_4px_0_#1E293B]">
              HSK {hsk.level}
            </div>
            <SectionBadge
              text={
                hsk.level <= 2
                  ? 'Beginner'
                  : hsk.level <= 4
                    ? 'Intermediate'
                    : 'Advanced'
              }
            />
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-foreground mb-4 leading-[1.1]">
            HSK {hsk.level}: {hsk.vocabCount} Words & Complete Guide
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed mb-6">
            {hsk.description}
          </p>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="brutal-card p-4 text-center">
              <BookOpen className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="text-2xl font-extrabold text-foreground tabular-nums">
                {hsk.vocabCount}
              </div>
              <div className="text-xs text-slate-500">Vocabulary</div>
            </div>
            <div className="brutal-card p-4 text-center">
              <Sparkles className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="text-2xl font-extrabold text-foreground tabular-nums">
                {hsk.characterCount}
              </div>
              <div className="text-xs text-slate-500">Characters</div>
            </div>
            <div className="brutal-card p-4 text-center">
              <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="text-2xl font-extrabold text-foreground tabular-nums">
                {hsk.studyHours}
              </div>
              <div className="text-xs text-slate-500">Study hours</div>
            </div>
          </div>

          <ExamCtaButton
            authedHref={`/tests?examType=HSK_${hsk.level}`}
            className="brutal-btn bg-primary text-white px-7 py-3 text-sm inline-flex items-center gap-2"
          >
            Start HSK {hsk.level} Practice <ArrowRight className="w-4 h-4" />
          </ExamCtaButton>
        </div>
      </section>

      {/* ABILITIES */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-6">
            What You Can Do at HSK {hsk.level}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {hsk.abilities.map((a) => (
              <div
                key={a}
                className="bg-white border-2 border-border-strong rounded-xl p-4 text-sm text-foreground font-medium"
              >
                ✓ {a}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EXAM FORMAT */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-4">
            HSK {hsk.level} Exam Format
          </h2>
          <div className="brutal-card p-6">
            <p className="text-slate-600 leading-relaxed">{hsk.examFormat}</p>
          </div>
        </div>
      </section>

      {/* SAMPLE VOCAB */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-2">
            Sample HSK {hsk.level} Vocabulary
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            A preview of common words at this level. The full list of{' '}
            {hsk.vocabCount} words is available inside our flashcard deck.
          </p>
          <div className="overflow-x-auto brutal-card p-0">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-border-strong bg-slate-50">
                  <th className="py-3 px-4 text-sm font-bold text-foreground">Hanzi</th>
                  <th className="py-3 px-4 text-sm font-bold text-foreground">Pinyin</th>
                  <th className="py-3 px-4 text-sm font-bold text-foreground">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {hsk.sampleWords.map((w) => (
                  <tr key={w.hanzi} className="border-b border-border last:border-0">
                    <td className="py-3 px-4 text-xl font-heading">{w.hanzi}</td>
                    <td className="py-3 px-4 text-slate-600 italic">{w.pinyin}</td>
                    <td className="py-3 px-4 text-foreground">{w.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6">
            <ExamCtaButton
              authedHref="/flashcards"
              className="brutal-btn bg-secondary text-secondary-foreground px-6 py-2.5 text-sm inline-flex items-center gap-2"
            >
              Unlock the full {hsk.vocabCount}-word deck{' '}
              <ArrowRight className="w-4 h-4" />
            </ExamCtaButton>
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR + TIPS */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
          <div className="brutal-card p-6">
            <h3 className="text-xl font-bold text-foreground mb-3">
              Who HSK {hsk.level} Is For
            </h3>
            <p className="text-slate-600 leading-relaxed text-sm">
              {hsk.targetAudience}
            </p>
          </div>
          <div className="brutal-card p-6">
            <h3 className="text-xl font-bold text-foreground mb-3">
              Study Tips
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              {hsk.tips.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="text-primary font-bold">→</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* PREV / NEXT */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-4 justify-between">
          {prev ? (
            <Link
              href={`/hsk/${prev}`}
              className="brutal-card p-4 flex-1 hover:bg-secondary/40"
            >
              <div className="text-xs text-slate-500">← Previous level</div>
              <div className="font-bold text-foreground">HSK {prev}</div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {next ? (
            <Link
              href={`/hsk/${next}`}
              className="brutal-card p-4 flex-1 text-right hover:bg-secondary/40"
            >
              <div className="text-xs text-slate-500">Next level →</div>
              <div className="font-bold text-foreground">HSK {next}</div>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
