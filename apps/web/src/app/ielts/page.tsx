import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  CheckCircle2,
  Headphones,
  BookOpen,
  PenLine,
  Mic,
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
  title: 'IELTS Preparation Online — Free Practice Tests & AI Feedback',
  description:
    'Prepare for IELTS Academic and General Training with free full-length practice tests, AI-graded writing and speaking feedback, and band-targeted vocabulary drills.',
  path: '/ielts',
  keywords: [
    'ielts practice test',
    'free ielts practice test online',
    'ielts preparation',
    'ielts band 7 vocabulary',
    'ielts speaking practice',
    'ielts writing task 2',
    'ai ielts evaluator',
  ],
});

const ieltsFaqs = [
  {
    question: 'Are the IELTS practice tests on NEU Study free?',
    answer:
      'Yes. All IELTS Listening and Reading practice tests are 100% free. Writing and Speaking evaluations by our AI use credits, but every new account starts with a free credit balance so you can try them before committing.',
  },
  {
    question: 'Does NEU Study cover both IELTS Academic and General Training?',
    answer:
      'Yes. Our question bank includes Academic and General Training variants for Reading and Writing, matching the official Cambridge format.',
  },
  {
    question: 'How accurate is the AI IELTS Writing evaluator?',
    answer:
      'Our AI is trained on thousands of band-scored sample essays and follows the official IELTS Writing band descriptors: Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. It predicts an overall band within 0.5 of certified examiner scores in most cases.',
  },
  {
    question: 'How long does it take to go from Band 6 to Band 7?',
    answer:
      'Most learners need 2 to 3 months of focused study averaging one hour per day. The biggest gains come from targeted Writing and Speaking practice with consistent feedback, not from doing more untimed Reading.',
  },
];

const sections = [
  {
    icon: Headphones,
    color: 'text-sky-700',
    bg: 'bg-sky-100',
    title: 'IELTS Listening',
    body:
      'Forty questions across four recordings covering conversations and academic lectures. Our practice set mirrors the real exam tempo, with native speakers from the UK, Australia, Canada, and the US.',
  },
  {
    icon: BookOpen,
    color: 'text-rose-700',
    bg: 'bg-rose-100',
    title: 'IELTS Reading',
    body:
      'Three passages with forty questions. Academic uses journal-style texts; General Training uses workplace and everyday materials. Filter by difficulty and question type to drill True/False/Not Given, matching headings, and sentence completion.',
  },
  {
    icon: PenLine,
    color: 'text-violet-700',
    bg: 'bg-violet-100',
    title: 'IELTS Writing',
    body:
      'Task 1 (150 words, 20 minutes) and Task 2 (250 words, 40 minutes). Submit any essay to our AI for band-level feedback with specific rewrites — grammar, lexical range, coherence, and task response are scored separately.',
  },
  {
    icon: Mic,
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    title: 'IELTS Speaking',
    body:
      'Three parts: introduction, long turn cue card, and discussion. Record your answers and get pronunciation scoring, fluency analysis, and example Band 8 model responses for every topic.',
  },
];

export default function IeltsPage() {
  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'IELTS', path: '/ielts' },
          ]),
          courseSchema({
            name: 'IELTS Preparation — Full Practice Suite',
            description:
              'Complete IELTS preparation covering Listening, Reading, Writing, and Speaking with AI feedback and band-targeted drills.',
            path: '/ielts',
          }),
          faqSchema(ieltsFaqs),
        ]}
      />
      <Navbar />

      {/* HERO */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <SectionBadge text="IELTS Academic & General" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground mt-4 mb-6 leading-[1.1]">
            IELTS Preparation:{' '}
            <span className="text-primary italic">Free Tests</span> & AI
            Feedback
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto mb-8 leading-relaxed">
            Get ready for the IELTS with full-length practice tests, AI-graded
            Writing and Speaking evaluation, and a vocabulary engine that
            targets the band score you actually need. No generic drills — every
            session adapts to your weakest skill.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <ExamCtaButton
              authedHref="/tests?examType=IELTS_ACADEMIC"
              className="brutal-btn bg-primary text-white px-7 py-3 text-sm inline-flex items-center gap-2"
            >
              Start Free Practice <ArrowRight className="w-4 h-4" />
            </ExamCtaButton>
            <Link
              href="/tests"
              className="brutal-btn bg-secondary text-secondary-foreground px-7 py-3 text-sm"
            >
              Browse All IELTS Tests
            </Link>
          </div>
        </div>
      </section>

      {/* FOUR SKILLS */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <SectionBadge text="All Four Skills" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4">
              Practice Every IELTS Section
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {sections.map((s) => (
              <div key={s.title} className="brutal-card p-6">
                <div
                  className={`w-12 h-12 ${s.bg} border-[2.5px] border-border-strong rounded-xl flex items-center justify-center mb-4`}
                >
                  <s.icon className={`w-6 h-6 ${s.color}`} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {s.title}
                </h3>
                <p className="text-slate-600 leading-relaxed text-sm">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY IELTS ON NEU STUDY */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <SectionBadge text="Why NEU Study" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4 mb-3">
              Built for Band 7+ Targets
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Most IELTS tools throw generic drills at you. We use your actual
              mistakes to build a personalized study plan that compounds over
              time.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                title: 'AI Writing grading that matches real band descriptors',
                body:
                  'Every essay is scored on the four official criteria with specific sentence-level rewrites — not a generic "make it clearer" hint.',
              },
              {
                title: 'Pronunciation scoring at the phoneme level',
                body:
                  'Speaking practice gives you the exact /θ/, /ð/, or /r/ sounds to fix, with model audio to imitate.',
              },
              {
                title: 'Adaptive vocabulary for Band 6, 7, 8, and 9',
                body:
                  'Band-tagged word lists so you learn exactly the vocabulary examiners look for at your target score, not a random 3000-word dump.',
              },
              {
                title: 'Timed mock tests with official question formats',
                body:
                  'Full Cambridge-style Listening and Reading passages with the real 2-hour-and-45-minute timing.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-3 bg-white border-2 border-border-strong rounded-xl p-5"
              >
                <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-foreground mb-1 text-base">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-600">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STUDY PLAN */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <SectionBadge text="Study Plan" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4">
              A Realistic 30-Day Roadmap
            </h2>
          </div>
          <div className="space-y-4">
            {[
              {
                week: 'Week 1',
                focus: 'Diagnostic test + vocabulary foundation',
                detail:
                  'Take one full mock under timed conditions. Build a 100-word academic vocabulary bank tagged to your target band.',
              },
              {
                week: 'Week 2',
                focus: 'Listening + Reading pattern recognition',
                detail:
                  'One passage and one section daily. Track wrong answers by question type — most Band 6 to 7 jumps come from fixing three or four recurring traps.',
              },
              {
                week: 'Week 3',
                focus: 'Writing Task 2 structure',
                detail:
                  'Write one essay every other day. Get AI feedback, fix one weakness, and repeat before moving on.',
              },
              {
                week: 'Week 4',
                focus: 'Speaking drills + full mocks',
                detail:
                  'Record every Part 2 cue card topic. Take two full mock tests and review the entire answer transcript, not just the score.',
              },
            ].map((p) => (
              <div key={p.week} className="brutal-card p-5 flex gap-4">
                <div className="w-14 h-14 shrink-0 bg-primary text-white border-[2.5px] border-border-strong rounded-xl flex items-center justify-center font-extrabold text-xs text-center leading-tight">
                  {p.week}
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">{p.focus}</h3>
                  <p className="text-sm text-slate-600">{p.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/blog/how-to-get-ielts-band-7"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
            >
              Read the full Band 7 guide <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* RELATED */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-8">
            Related Tools & Exams
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { href: '/toeic', label: 'TOEIC Prep', icon: Target },
              { href: '/hsk', label: 'HSK Chinese', icon: Target },
              {
                href: '/pronunciation',
                label: 'AI Pronunciation',
                icon: Mic,
              },
              {
                href: '/flashcards',
                label: 'AI Flashcards',
                icon: Sparkles,
              },
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
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <SectionBadge text="FAQ" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4">
              IELTS Questions, Answered
            </h2>
          </div>
          <div className="space-y-4">
            {ieltsFaqs.map((f) => (
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
