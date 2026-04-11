import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Clock,
  Brain,
  Award,
  Users,
  BookOpen,
  Code,
  BarChart3,
  Smartphone,
} from 'lucide-react';
import {
  Navbar,
  Footer,
  SectionBadge,
  FeatureCard,
  TestCard,
  TestimonialCard,
  WelcomeAnimation,
  Reveal,
  CtaSection,
} from '@/components/landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildMetadata,
  organizationSchema,
  websiteSchema,
  faqSchema,
} from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'NEU Study — AI-Powered IELTS, TOEIC & HSK Exam Prep',
  description:
    'Prepare for IELTS, TOEIC, and HSK with 10,000+ free practice tests, AI pronunciation feedback, smart flashcards, and instant AI grading on writing and speaking.',
  path: '/',
});

const homepageFaqs = [
  {
    question: 'Is NEU Study free to use?',
    answer:
      'Yes — you can access thousands of IELTS, TOEIC, and HSK practice tests for free. Premium AI features like pronunciation scoring, writing evaluation, and unlimited flashcard generation use a credit-based system with a free starting balance.',
  },
  {
    question: 'Which exams does NEU Study support?',
    answer:
      'NEU Study covers IELTS (Academic and General), TOEIC Listening & Reading, TOEIC Speaking & Writing, and HSK levels 1 through 6. We also offer pronunciation training and vocabulary flashcards for general English and Chinese learners.',
  },
  {
    question: 'How does the AI pronunciation checker work?',
    answer:
      'Record yourself reading a prompt and our AI scores your pronunciation on accuracy, fluency, and intonation. You get word-level feedback highlighting which phonemes to improve, plus a model audio you can compare against.',
  },
  {
    question: 'Can I track my progress over time?',
    answer:
      'Yes. Every practice test, flashcard session, and pronunciation attempt is logged to your dashboard so you can see your score trend, weak areas, and study streak across exams.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-cream">
      <JsonLd
        data={[
          organizationSchema(),
          websiteSchema(),
          faqSchema(homepageFaqs),
        ]}
      />
      <Navbar />

      {/* ===== HERO SECTION ===== */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Announcement badge */}
          <div className="mb-8 hero-fade-in">
            <span className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground text-xs font-semibold px-4 py-2 rounded-full border border-teal-200">
              <span className="w-2 h-2 bg-primary rounded-full" />
              New: AI-Powered Learning
            </span>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div>
              <h1 className="hero-fade-in hero-fade-in-1 text-5xl sm:text-6xl lg:text-7xl font-extrabold text-foreground leading-[1.1] mb-6">
                Ace Any Language Exam,{' '}
                <span className="text-primary italic">Anytime</span>,{' '}
                <span className="text-foreground">Anywhere!</span>
              </h1>
              <p className="hero-fade-in hero-fade-in-2 text-lg text-slate-500 max-w-lg mb-8 leading-relaxed">
                IELTS, TOEIC, HSK and more — one platform for all your language
                goals. Practice 10,000+ tests with AI-powered feedback from
                expert instructors.
              </p>

              {/* CTA Buttons */}
              <div className="hero-fade-in hero-fade-in-3 flex flex-wrap gap-4 mb-12">
                <Link
                  href="/register"
                  className="brutal-btn cta-glow bg-primary text-white px-8 py-3.5 text-sm flex items-center gap-2 group"
                >
                  Start Learning Free
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/tests"
                  className="brutal-btn bg-secondary text-secondary-foreground px-8 py-3.5 text-sm"
                >
                  Browse Tests
                </Link>
              </div>

              {/* Stats */}
              <div className="hero-fade-in hero-fade-in-4 flex gap-10">
                <div>
                  <p className="text-3xl font-extrabold text-foreground">10K+</p>
                  <p className="text-sm text-slate-500">Tests</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-foreground">2M+</p>
                  <p className="text-sm text-slate-500">Students</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold text-foreground">500+</p>
                  <p className="text-sm text-slate-500">Instructors</p>
                </div>
              </div>
            </div>

            {/* Right: Welcome Animation */}
            <div className="hidden lg:flex items-center justify-center hero-fade-in hero-fade-in-2 -mr-16 -my-12">
              <WelcomeAnimation />
            </div>
          </div>
        </div>
      </section>

      {/* ===== POPULAR TESTS SECTION ===== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <Reveal>
            <SectionBadge text="Popular Tests" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4 mb-3">
              Explore Top-Rated Tests
            </h2>
            <p className="text-slate-500 mb-12 max-w-lg mx-auto">
              Learn from industry experts and gain real-world skills
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
            <Reveal delay={1}>
              <TestCard
                icon={Code}
                iconBg="bg-rose-100"
                iconColor="text-rose-600"
                title="IELTS Academic Full Suite"
                author="Sarah Chen"
                lessons={48}
                hours={24}
                students="12.5K"
                rating={4.9}
              />
            </Reveal>
            <Reveal delay={2}>
              <TestCard
                icon={BookOpen}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                title="TOEIC Listening & Reading"
                author="Mike Johnson"
                lessons={36}
                hours={18}
                students="8.2K"
                rating={4.8}
              />
            </Reveal>
            <Reveal delay={3}>
              <TestCard
                icon={BarChart3}
                iconBg="bg-purple-100"
                iconColor="text-purple-600"
                title="HSK 1–6 Chinese Mastery"
                author="Emily Davis"
                lessons={52}
                hours={30}
                students="15.3K"
                rating={4.9}
              />
            </Reveal>
            <Reveal delay={4}>
              <TestCard
                icon={Smartphone}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-600"
                title="Speaking & Pronunciation Lab"
                author="Alex Kim"
                lessons={42}
                hours={22}
                students="9.8K"
                rating={4.7}
              />
            </Reveal>
          </div>

          <Reveal className="mt-10">
            <Link
              href="/tests"
              className="brutal-btn inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 text-sm group"
            >
              View All Tests
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ===== WHY CHOOSE US SECTION ===== */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 bg-[#FFF4D6] border-y-[2.5px] border-foreground overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle, #0f172a 1.5px, transparent 1.5px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative max-w-7xl mx-auto text-center">
          <Reveal>
            <SectionBadge text="Why Choose Us" />
            <h2 className="text-4xl sm:text-5xl font-extrabold text-foreground mt-4 mb-4 tracking-tight">
              Everything You Need to Succeed
            </h2>
            <p className="text-slate-700 text-base sm:text-lg max-w-2xl mx-auto mb-14 font-medium">
              Built for serious learners who want results — not just another app.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-7">
            <Reveal delay={1}>
              <FeatureCard
                icon={Clock}
                iconBg="bg-rose-200"
                iconColor="text-rose-600"
                title="Learn at Your Pace"
                description="Access tests anytime, anywhere. Pause, rewind, and replay lessons as needed."
              />
            </Reveal>
            <Reveal delay={2}>
              <FeatureCard
                icon={Brain}
                iconBg="bg-sky-200"
                iconColor="text-sky-700"
                title="AI-Powered Feedback"
                description="Get instant, intelligent feedback on your writing and speaking skills."
              />
            </Reveal>
            <Reveal delay={3}>
              <FeatureCard
                icon={Award}
                iconBg="bg-violet-200"
                iconColor="text-violet-700"
                title="Certificates"
                description="Earn recognized certificates to showcase your new skills."
              />
            </Reveal>
            <Reveal delay={4}>
              <FeatureCard
                icon={Users}
                iconBg="bg-emerald-200"
                iconColor="text-emerald-700"
                title="Community Support"
                description="Join a community of learners. Ask questions and share knowledge."
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS SECTION ===== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <Reveal>
            <SectionBadge text="Student Stories" />
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4 mb-12">
              What Our Students Say
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left">
            <Reveal delay={1}>
              <TestimonialCard
                quote="NEU Study helped me jump from IELTS 6.0 to 7.5 in just 2 months. The AI feedback on my writing was incredibly helpful!"
                name="Jessica Wang"
                role="IELTS 7.5 Achiever"
                initial="J"
                initialBg="bg-rose-400"
              />
            </Reveal>
            <Reveal delay={2}>
              <TestimonialCard
                quote="I hit a TOEIC score of 950 in just 3 months. The listening drills and AI explanations made all the difference!"
                name="David Miller"
                role="TOEIC 950 Scorer"
                initial="D"
                initialBg="bg-teal-400"
              />
            </Reveal>
            <Reveal delay={3}>
              <TestimonialCard
                quote="I passed HSK 5 on my first try thanks to the smart flashcards and pronunciation coach. Finally a platform that gets Chinese learners!"
                name="Maria Garcia"
                role="HSK 5 Graduate"
                initial="M"
                initialBg="bg-purple-400"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <CtaSection />

      {/* ===== FOOTER ===== */}
      <Footer />
    </div>
  );
}
