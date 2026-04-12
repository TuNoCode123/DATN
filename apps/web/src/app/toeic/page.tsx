import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCircle2,
  Headphones,
  BookOpen,
  Mic,
  PenLine,
  Target,
  Sparkles,
} from 'lucide-react';
import { Navbar, Footer, SectionBadge, ExamCtaButton } from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildMetadata,
  breadcrumbSchema,
  courseSchema,
  faqSchema,
} from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'TOEIC Practice Test Online — Free L&R and Speaking & Writing Prep',
  description:
    'Prepare for TOEIC Listening & Reading and TOEIC Speaking & Writing with free practice tests, part-by-part drills, and AI-graded scoring aligned to official rubrics.',
  path: '/toeic',
  keywords: [
    'toeic practice test',
    'free toeic practice test online',
    'toeic listening practice',
    'toeic part 5 grammar',
    'toeic speaking writing',
    'toeic 900 strategy',
  ],
});

const toeicFaqs = [
  {
    question: 'Is there a free TOEIC practice test on NEU Study?',
    answer:
      'Yes. Free full-length TOEIC Listening and Reading practice tests are available to any registered user. Speaking and Writing evaluations use AI credits, with a free starting balance for new accounts.',
  },
  {
    question: 'What is a good TOEIC score?',
    answer:
      'TOEIC is scored 10 to 990. 605 is considered working proficiency, 785 is professional, and 900+ is near-native. Most multinational employers require 700 or higher for international roles.',
  },
  {
    question: 'Does NEU Study cover both TOEIC tests?',
    answer:
      'Yes. We cover TOEIC Listening & Reading (the standard paper/computer test) and TOEIC Speaking & Writing, which is administered separately and required for customer-facing roles in many companies.',
  },
  {
    question: 'How long should I prepare for TOEIC?',
    answer:
      'Most learners at intermediate level (around 500 TOEIC) can reach 700+ in 6 to 8 weeks of daily practice. Reaching 900+ usually requires 2 to 3 months of focused drilling on Parts 5, 6, and 7.',
  },
];

const parts = [
  { part: 'Part 1', title: 'Photographs', body: '6 questions. Describe the action in a photo. Watch for passive voice and present continuous.' },
  { part: 'Part 2', title: 'Question–Response', body: '25 questions. Short questions with three spoken answer choices. Listen for the question word (What, Where, Why).' },
  { part: 'Part 3', title: 'Conversations', body: '39 questions across 13 conversations. Preview all three questions before the audio plays.' },
  { part: 'Part 4', title: 'Short Talks', body: '30 questions across 10 talks. Announcements, voicemails, tour commentary. Infer purpose and tone.' },
  { part: 'Part 5', title: 'Incomplete Sentences', body: '30 grammar and vocabulary questions. Ten grammar patterns cover 80% of the answers.' },
  { part: 'Part 6', title: 'Text Completion', body: '16 questions. Fill blanks in short business texts. Read the full passage — context changes tense choices.' },
  { part: 'Part 7', title: 'Reading Comprehension', body: '54 questions across single, double, and triple passages. The biggest time sink — budget 55 minutes.' },
];

export default function ToeicPage() {
  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'TOEIC', path: '/toeic' },
          ]),
          courseSchema({
            name: 'TOEIC Preparation — Listening, Reading, Speaking & Writing',
            description:
              'Complete TOEIC preparation with part-by-part drills, full mock tests, and AI-graded Speaking and Writing.',
            path: '/toeic',
          }),
          faqSchema(toeicFaqs),
        ]}
      />
      <Navbar />

      {/* HERO */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <SectionBadge text="TOEIC L&R and S&W" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground mt-4 mb-6 leading-[1.1]">
            Score <span className="text-primary italic">900+</span> on TOEIC
            with Confidence
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto mb-8 leading-relaxed">
            Every TOEIC part has a pattern. We teach you those patterns with
            part-by-part drills, full-length mocks, and AI grading that
            predicts your band within 25 points.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <ExamCtaButton
              authedHref="/tests?examType=TOEIC_LR"
              className="brutal-btn bg-primary text-white px-7 py-3 text-sm inline-flex items-center gap-2"
            >
              Start Free TOEIC Practice <ArrowRight className="w-4 h-4" />
            </ExamCtaButton>
            <Link
              href="/blog/toeic-900-listening-reading-strategy"
              className="brutal-btn bg-secondary text-secondary-foreground px-7 py-3 text-sm"
            >
              Read 900+ Strategy Guide
            </Link>
          </div>
        </div>
      </section>

      {/* PART BY PART */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <SectionBadge text="Test Breakdown" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4 mb-3">
              Every TOEIC Part, Covered
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Listening & Reading has 200 questions across 7 parts. Each has
              its own trap. Master the part, not just the content.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {parts.map((p) => (
              <div key={p.part} className="brutal-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-primary uppercase tracking-wide">
                    {p.part}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {p.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SKILLS */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <SectionBadge text="Both Exams" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4">
              TOEIC L&R and TOEIC S&W
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="brutal-card p-6">
              <div className="w-12 h-12 bg-sky-100 border-[2.5px] border-border-strong rounded-xl flex items-center justify-center mb-4">
                <Headphones className="w-6 h-6 text-sky-700" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                Listening & Reading (L&R)
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-3">
                200 multiple-choice questions, 2 hours, scored 10 to 990. This
                is the standard TOEIC most employers ask for. Free practice
                mocks available immediately after signup.
              </p>
              <div className="flex items-center gap-2 text-xs text-primary font-semibold">
                <BookOpen className="w-4 h-4" /> 2 hours · 200 questions
              </div>
            </div>
            <div className="brutal-card p-6">
              <div className="w-12 h-12 bg-violet-100 border-[2.5px] border-border-strong rounded-xl flex items-center justify-center mb-4">
                <Mic className="w-6 h-6 text-violet-700" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                Speaking & Writing (S&W)
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-3">
                Administered separately. Speaking is 11 questions over 20
                minutes; Writing is 8 tasks over 60 minutes. Our AI grader
                follows the official ETS rubric for pronunciation, grammar,
                and cohesion.
              </p>
              <div className="flex items-center gap-2 text-xs text-primary font-semibold">
                <PenLine className="w-4 h-4" /> AI-graded on ETS rubric
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SCORE BENCHMARKS */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <SectionBadge text="Score Guide" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4">
              What TOEIC Scores Mean
            </h2>
          </div>
          <div className="space-y-3">
            {[
              { range: '905 – 990', label: 'Near-native', note: 'Top 5%. Required for language-sensitive leadership roles.' },
              { range: '785 – 900', label: 'Professional working', note: 'Functional in all professional contexts. Most multinationals require 800+.' },
              { range: '605 – 780', label: 'Limited working', note: 'Can handle routine business tasks in English.' },
              { range: '405 – 600', label: 'Elementary', note: 'Daily English conversation. Not yet professional.' },
              { range: '10 – 400', label: 'Beginner', note: 'Focus on foundational grammar and high-frequency vocabulary.' },
            ].map((s) => (
              <div
                key={s.range}
                className="flex gap-4 items-start bg-white border-2 border-border-strong rounded-xl p-4"
              >
                <div className="w-24 shrink-0 font-extrabold text-primary tabular-nums text-sm">
                  {s.range}
                </div>
                <div>
                  <div className="font-bold text-foreground text-base">
                    {s.label}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{s.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY US */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <SectionBadge text="Why NEU Study" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4">
              Built to Jump You a Band
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              'Smart Part 5 drill that learns which grammar patterns you miss',
              'Full L&R mocks at 1.0x and 1.25x audio speed',
              'S&W prompts graded against real ETS rubric criteria',
              'Weekly progress report showing band projection',
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
              { href: '/hsk', label: 'HSK Chinese', icon: Target },
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
              TOEIC Questions, Answered
            </h2>
          </div>
          <div className="space-y-4">
            {toeicFaqs.map((f) => (
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
