import Link from 'next/link';
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
  CheckCircle2,
} from 'lucide-react';
import {
  Navbar,
  Footer,
  SectionBadge,
  FeatureCard,
  TestCard,
  TestimonialCard,
  HeroCard,
} from '@/components/landing';

export default function Home() {
  return (
    <div className="min-h-screen bg-cream">
      <Navbar />

      {/* ===== HERO SECTION ===== */}
      <section className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Announcement badge */}
          <div className="mb-8">
            <span className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground text-xs font-semibold px-4 py-2 rounded-full border border-teal-200">
              <span className="w-2 h-2 bg-primary rounded-full" />
              New: AI-Powered Learning
            </span>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-foreground leading-[1.1] mb-6">
                Master IELTS,{' '}
                <span className="text-primary italic">Anytime</span>,{' '}
                <span className="text-foreground">Anywhere!</span>
              </h1>
              <p className="text-lg text-slate-500 max-w-lg mb-8 leading-relaxed">
                Join millions of learners worldwide. Access 10,000+ practice
                tests with AI-powered feedback from expert instructors.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-wrap gap-4 mb-12">
                <Link
                  href="/register"
                  className="brutal-btn bg-primary text-white px-8 py-3.5 text-sm flex items-center gap-2"
                >
                  Start Learning Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/tests"
                  className="brutal-btn bg-secondary text-secondary-foreground px-8 py-3.5 text-sm"
                >
                  Browse Tests
                </Link>
              </div>

              {/* Stats */}
              <div className="flex gap-10">
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

            {/* Right: Hero Card */}
            <div className="hidden lg:flex justify-center">
              <HeroCard />
            </div>
          </div>
        </div>
      </section>

      {/* ===== POPULAR TESTS SECTION ===== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <SectionBadge text="Popular Tests" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4 mb-3">
            Explore Top-Rated Tests
          </h2>
          <p className="text-slate-500 mb-12 max-w-lg mx-auto">
            Learn from industry experts and gain real-world skills
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
            <TestCard
              icon={Code}
              iconBg="bg-rose-100"
              iconColor="text-rose-600"
              title="IELTS Academic Reading"
              author="Sarah Chen"
              lessons={48}
              hours={24}
              students="12.5K"
              rating={4.9}
            />
            <TestCard
              icon={BookOpen}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              title="IELTS Listening Mastery"
              author="Mike Johnson"
              lessons={36}
              hours={18}
              students="8.2K"
              rating={4.8}
            />
            <TestCard
              icon={BarChart3}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
              title="IELTS Writing Task 1 & 2"
              author="Emily Davis"
              lessons={52}
              hours={30}
              students="15.3K"
              rating={4.9}
            />
            <TestCard
              icon={Smartphone}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
              title="IELTS Speaking Practice"
              author="Alex Kim"
              lessons={42}
              hours={22}
              students="9.8K"
              rating={4.7}
            />
          </div>

          <div className="mt-10">
            <Link
              href="/tests"
              className="brutal-btn inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 text-sm"
            >
              View All Tests
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===== WHY CHOOSE US SECTION ===== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto text-center">
          <SectionBadge text="Why Choose Us" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4 mb-12">
            Everything You Need to Succeed
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={Clock}
              iconBg="bg-rose-100"
              iconColor="text-rose-600"
              title="Learn at Your Pace"
              description="Access tests anytime, anywhere. Pause, rewind, and replay lessons as needed."
            />
            <FeatureCard
              icon={Brain}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              title="AI-Powered Feedback"
              description="Get instant, intelligent feedback on your writing and speaking skills."
            />
            <FeatureCard
              icon={Award}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
              title="Certificates"
              description="Earn recognized certificates to showcase your new skills."
            />
            <FeatureCard
              icon={Users}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
              title="Community Support"
              description="Join a community of learners. Ask questions and share knowledge."
            />
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS SECTION ===== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <SectionBadge text="Student Stories" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mt-4 mb-12">
            What Our Students Say
          </h2>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left">
            <TestimonialCard
              quote="IELTS AI helped me improve my reading score from 6.0 to 7.5 in just 2 months. The AI feedback on my writing was incredibly helpful!"
              name="Jessica Wang"
              role="IELTS 7.5 Achiever"
              initial="J"
              initialBg="bg-rose-400"
            />
            <TestimonialCard
              quote="The listening practice tests were exactly what I needed. I landed my dream score of 8.0 just 3 months after starting!"
              name="David Miller"
              role="Graduate Student"
              initial="D"
              initialBg="bg-teal-400"
            />
            <TestimonialCard
              quote="Best investment I've made in my career. The speaking practice gave me practical skills I use every day."
              name="Maria Garcia"
              role="Working Professional"
              initial="M"
              initialBg="bg-purple-400"
            />
          </div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-accent-blue">
        <div className="max-w-3xl mx-auto">
          <div className="brutal-card p-10 sm:p-14 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              Ready to Start Learning?
            </h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              Join over 2 million students and start your IELTS journey today.
              First 7 days are completely free!
            </p>

            <div className="flex flex-wrap justify-center gap-4 mb-6">
              <Link
                href="/register"
                className="brutal-btn bg-primary text-white px-8 py-3.5 text-sm flex items-center gap-2"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pronunciation"
                className="brutal-btn bg-secondary text-secondary-foreground px-8 py-3.5 text-sm"
              >
                Try Pronunciation
              </Link>
            </div>

            <div className="flex justify-center gap-6 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Cancel anytime
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <Footer />
    </div>
  );
}
