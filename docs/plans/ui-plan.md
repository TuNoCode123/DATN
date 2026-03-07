# UI Plan: IELTS AI Learning Platform — Landing Page

> **Target file:** `apps/web/src/app/page.tsx`
> **Style:** Claymorphism — playful, vibrant, educational
> **Stack:** Next.js 16 (App Router) + Ant Design + TailwindCSS

---

## Design System

### Style: Claymorphism

| Property | Value |
|----------|-------|
| Border radius | 16–24px (cards), 12px (buttons), 32px (badges) |
| Border | 3–4px solid (slightly darker than fill color) |
| Shadow (outer) | `box-shadow: 0 8px 20px rgba(0,0,0,0.15)` |
| Shadow (inner) | `box-shadow: inset 0 2px 4px rgba(255,255,255,0.5)` |
| Combined | Outer dark + inner light = "puffy" clay look |
| Hover | `translateY(-4px)` + deeper outer shadow (200ms ease-out) |
| Active/Press | `translateY(2px)` + reduced shadow (soft press) |
| Surfaces | Solid fills (not transparent) — clay is opaque |
| Texture feel | Smooth gradient overlays: `linear-gradient(135deg, color+15% top, color bottom)` |

### Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary | `#4F46E5` | Navbar, headings, primary buttons |
| Primary Light | `#818CF8` | Secondary accents, hover states |
| CTA / Success | `#22C55E` | "Start Free" button, correct answers |
| Background | `#EEF2FF` | Page background (soft indigo tint) |
| Text Dark | `#312E81` | Headings, body text |
| Text Muted | `#6366F1` | Subheadings, labels |
| Warning / Gold | `#F59E0B` | Star ratings, streak badges |
| Error / Red | `#EF4444` | Incorrect answers |
| Card: IELTS | `#6366F1` (indigo) | IELTS test card |
| Card: TOEIC | `#06B6D4` (cyan) | TOEIC test card |
| Card: JLPT | `#EC4899` (pink) | JLPT test card |
| Card: HSK | `#F97316` (orange) | HSK test card |
| Card: TOPIK | `#8B5CF6` (violet) | TOPIK test card |
| Card: SAT | `#10B981` (emerald) | SAT/ACT test card |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Hero heading | Baloo 2 | 700 | 56px / 4rem (desktop), 36px mobile |
| Section heading | Baloo 2 | 600 | 36px / 2.25rem |
| Card title | Baloo 2 | 600 | 20px |
| Body text | Comic Neue | 400 | 16px (1rem), line-height 1.6 |
| Labels / Tags | Comic Neue | 700 | 14px |
| Stat numbers | Baloo 2 | 700 | 48px (hero counters) |

```css
/* Google Fonts import — add to apps/web/src/app/layout.tsx */
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700&family=Comic+Neue:wght@300;400;700&display=swap');
```

### Clay Card Recipe (reusable pattern)

```tsx
// Tailwind class set for a clay card
className="
  rounded-2xl           // 16px border-radius
  border-[3px]          // thick border
  border-indigo-300     // slightly darker than fill
  bg-indigo-100         // solid opaque fill
  shadow-[0_8px_20px_rgba(0,0,0,0.15),inset_0_2px_4px_rgba(255,255,255,0.5)]
  hover:shadow-[0_14px_28px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.5)]
  hover:-translate-y-1  // subtle lift
  transition-all duration-200
  cursor-pointer
"
```

---

## Page Architecture

```
apps/web/src/app/page.tsx           ← Server Component, imports sections
apps/web/src/app/_components/       ← Landing-only components (co-located)
  ├── Navbar.tsx
  ├── HeroSection.tsx
  ├── StatsBar.tsx
  ├── CourseCatalog.tsx
  ├── ProgressDemo.tsx
  ├── TestimonialsSection.tsx
  ├── EnrollCTA.tsx
  └── Footer.tsx
```

---

## Section-by-Section Spec

---

### 1. Navbar

**Layout:** Fixed top, floating style (not full-bleed) — `top-4 left-4 right-4` with rounded-2xl

**Content:**
- Left: Logo (SVG icon + "IELTS AI" wordmark in Baloo 2)
- Center: Nav links — "Tests", "Progress", "AI Tutor", "Pricing"
- Right: "Login" (ghost button) + "Start Free" (CTA clay button, green `#22C55E`)

**Style:**
- Background: `bg-white/90 backdrop-blur-md` with `border-2 border-indigo-100`
- Clay shadow: `shadow-[0_4px_16px_rgba(79,70,229,0.15)]`
- On scroll: slightly more opaque (use `useScrollPosition` hook)
- Mobile: hamburger menu → slide-down drawer (Ant Design Drawer component)

**Code notes:**
```tsx
// Use Next.js Link for nav items
// Use 'use client' only if scroll detection needed
// Ant Design Button with custom className for clay style
```

---

### 2. Hero Section

**Layout:** Full-width, min-height `100vh`, two columns (desktop) — text left, visual right

**Left column content:**
- Eyebrow badge: "AI-Powered Learning" — pill shape, `bg-indigo-100 text-indigo-700 border-2 border-indigo-200`, bouncing pulse animation
- H1 heading: "Master Your English Exam with AI"
- Subheading: "Practice IELTS, TOEIC, JLPT & 10+ exams with smart feedback, personalized paths, and real test simulations."
- CTA buttons:
  - Primary: "Start Free Today" — large clay button, `bg-emerald-400 border-emerald-600 border-4 text-white`, hover lifts
  - Secondary: "View Tests" — ghost clay button, `bg-white border-3 border-indigo-300 text-indigo-700`
- Social proof micro-text: "Join 12,000+ students already studying"
- Avatars row: 5 overlapping circular avatar images + "12k+ learners" text

**Right column content (visual):**
- Large clay "device mockup" card floating: shows a mini test-taking UI screenshot
- 3 floating stat badges orbiting the mockup (CSS animation, slow float):
  - Badge 1: "Band 7.5" in gold — student achievement
  - Badge 2: "40 questions" in indigo
  - Badge 3: "Auto-graded" in green

**Background:**
- `bg-[#EEF2FF]` base
- Decorative blobs: `absolute` positioned circles with blur — `bg-indigo-200/40 blur-3xl rounded-full`
- Subtle grid pattern overlay (CSS background-image with grid lines)

**Animation:**
- Hero text: fade-in slide-up (staggered, 0ms / 150ms / 300ms)
- Floating badges: `animate-[float_3s_ease-in-out_infinite]` with custom keyframes
- Respect `prefers-reduced-motion`: skip animations if set

```tsx
// Floating keyframe in globals.css
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-12px); }
}
```

---

### 3. Stats Bar

**Layout:** Full-width strip between Hero and Catalog, 4 stats in a row (clay card background)

| Stat | Value | Label |
|------|-------|-------|
| 1 | 12,000+ | Active Students |
| 2 | 50+ | Practice Tests |
| 3 | 5 Languages | Supported |
| 4 | 4.9/5 | Avg. Rating |

**Style:**
- Container: `bg-white border-y-4 border-indigo-100 py-8` — subtle clay strip
- Each stat: number in Baloo 2 700 `#4F46E5`, label in Comic Neue below
- Dividers: vertical `border-r-2 border-indigo-100` between stats
- Numbers animate (count-up) when section enters viewport (`IntersectionObserver`)

---

### 4. Course Catalog Preview

**Section heading:** "Choose Your Exam"
**Subheading:** "10+ international exams, from IELTS to JLPT — all in one platform."

**Layout:** Horizontal scrollable row on mobile, 3-column grid on desktop (show 6 cards + "View All" card)

**Test Cards (Claymorphism):**

Each card is a clickable clay card linking to `/tests?examType=...`:

| Card | Color | Icon | Tags shown | Format |
|------|-------|------|-----------|--------|
| IELTS Academic | Indigo `#6366F1` | Book SVG | "Listening · Reading · Writing · Speaking" | FULL / CONDENSED |
| TOEIC L&R | Cyan `#06B6D4` | Headphones SVG | "Listening · Reading" | FULL |
| JLPT N1–N5 | Pink `#EC4899` | Torii gate SVG | "Grammar · Vocabulary · Reading" | FULL |
| HSK 1–6 | Orange `#F97316` | Characters SVG | "Listening · Reading · Writing" | FULL |
| TOPIK I & II | Violet `#8B5CF6` | Korean flag SVG | "Listening · Reading · Writing" | FULL |
| Digital SAT | Emerald `#10B981` | Pencil SVG | "Math · Reading · Writing" | FULL |

**Card anatomy:**
```
┌────────────────────────┐  ← border-[3px] border-{color}-400
│  [Icon 48px]           │  ← bg-{color}-100
│  IELTS Academic        │  ← Baloo 2, 600, text-{color}-800
│  ─────────────         │
│  40 questions  40 min  │  ← Comic Neue, stats row
│  1,240 attempts        │  ← muted, smaller
│                        │
│  [Listening] [Reading] │  ← tag pills, bg-{color}-200
│                        │
│  [Start Practice →]    │  ← small clay CTA button
└────────────────────────┘
```

**"View All Tests" card:** dashed border, center-aligned "Browse 50+ Tests →" link

**Ant Design usage:** Use Ant Design `Card` as base, override with Tailwind classes

---

### 5. Progress Tracking Demo

**Section heading:** "Track Every Step of Your Journey"
**Subheading:** "Real-time score analysis, question-by-question review, and your personal growth chart."

**Layout:** Two-column (desktop) — left: interactive demo panel, right: feature list

**Left — Interactive Demo Panel (clay card, large):**

Tab switcher (Ant Design `Tabs`, clay-styled):
- **Tab 1: Score Chart**
  - Mini line chart showing score over 6 attempts (use Ant Design `Statistic` + a simple SVG path or recharts line)
  - Y-axis: 0–40 questions correct; shows upward trend
  - Data points are clay circles on the line

- **Tab 2: Question Palette**
  - 40 square buttons in a grid (mimicking the real test UI)
  - Color coded: `bg-emerald-400` (correct), `bg-red-400` (wrong), `bg-slate-200` (unanswered)
  - Interactive: hover shows tooltip "Question 7: Correct"

- **Tab 3: Band Score**
  - IELTS band score breakdown: Listening 7.0, Reading 6.5, Writing — (locked), Speaking — (locked)
  - Clay stat cards in a 2x2 grid
  - "Unlock AI Writing feedback" CTA on the locked ones

**Right — Feature Bullets (3 items):**

Each item is a small horizontal clay card:
1. **Auto-Graded Results** — "Submit and instantly see correct/incorrect answers with explanations."
2. **Progress Over Time** — "Track score improvement across multiple attempts."
3. **AI-Powered Insights** — "Get personalized weak-area analysis. Coming in Phase 2."

SVG check icon (Heroicons `CheckCircle`) in `#22C55E` on each item.

---

### 6. How It Works

**Section heading:** "Get Started in 3 Steps"

**Layout:** 3-step horizontal flow (desktop), vertical on mobile

| Step | Number Badge | Title | Description |
|------|-------------|-------|-------------|
| 1 | Big clay `#4F46E5` badge "1" | Pick Your Exam | Browse IELTS, TOEIC, JLPT and more. Filter by skill or format. |
| 2 | Clay badge "2" | Take a Practice Test | Full test or section-only practice. Timer, auto-save, question palette. |
| 3 | Clay badge "3" | Review & Improve | Instant grading, answer explanations, score history and AI feedback. |

Between steps: dashed arrow connectors (SVG, hide on mobile)

Each step is a tall clay card with a decorative illustration at the top (simple geometric SVG, no emoji).

---

### 7. Student Testimonials

**Section heading:** "What Our Students Say"
**Subheading:** "Real results from real learners."

**Layout:** 3-column card grid (desktop), single column (mobile)

**Each testimonial card (clay):**
```
┌─────────────────────────────┐
│  ★ ★ ★ ★ ★  (gold, SVG)   │
│                             │
│  "The practice tests felt   │
│   exactly like the real     │
│   IELTS. Got Band 7.5!"     │
│                             │
│  [Avatar 40px]  Linh T.    │
│                 IELTS Band 7.5 │
│                 Ho Chi Minh City │
└─────────────────────────────┘
```

**Testimonial data:**

| Name | Score | Quote | Location |
|------|-------|-------|----------|
| Linh T. | IELTS 7.5 | "The mock tests are incredibly realistic. I improved 1.5 bands in 6 weeks!" | Ho Chi Minh City |
| Minh K. | TOEIC 910 | "Question explanations helped me understand patterns. Scored 910 on first try." | Hanoi |
| Yuki S. | JLPT N2 | "Finally a platform with proper JLPT listening practice. Passed N2!" | Tokyo |

**Carousel on mobile:** Ant Design `Carousel` component with dot indicators

**Background variation:** This section uses `bg-indigo-50` to break the page rhythm.

---

### 8. Enrollment CTA

**Layout:** Full-width section, centered, high visual impact

**Content:**
- Pre-headline badge: "Limited Beta Access" — bouncing clay badge, `bg-amber-400 border-amber-600`
- H2: "Start Your Exam Journey Today"
- Body: "Free to start. No credit card required. Practice any exam, anytime."
- Primary CTA: "Create Free Account" — extra-large clay button, `bg-emerald-400 border-emerald-600 border-4`, shadow `0 8px 0 #15803d` (3D press effect)
- Secondary: "Explore Tests →" text link in `#4F46E5`
- Trust signals below CTA: "12,000+ students" · "50+ tests" · "Free forever plan"

**Background:**
- Large clay card container: `bg-white rounded-3xl border-4 border-indigo-200`
- Outer page section: `bg-[#EEF2FF]` with decorative blob shapes (indigo + green gradient circles)

**3D Button Press Effect (key detail):**
```css
/* CTA button clay 3D press */
.cta-button {
  box-shadow: 0 8px 0 #15803d, 0 12px 20px rgba(34,197,94,0.3);
  transform: translateY(0);
  transition: all 150ms ease-out;
}
.cta-button:hover {
  box-shadow: 0 6px 0 #15803d, 0 10px 16px rgba(34,197,94,0.3);
  transform: translateY(2px);
}
.cta-button:active {
  box-shadow: 0 2px 0 #15803d;
  transform: translateY(6px);
}
```

---

### 9. Footer

**Layout:** 4-column grid (desktop), stacked (mobile)

| Column | Content |
|--------|---------|
| Brand | Logo + tagline + social icons (SVG: Twitter/X, GitHub, Facebook) |
| Platform | Tests Library, Dashboard, Writing Practice, Speaking (coming soon) |
| Exams | IELTS, TOEIC, JLPT, HSK, TOPIK, SAT |
| Support | About, Contact, Privacy Policy, Terms |

**Style:**
- Background: `bg-indigo-900` (dark indigo for contrast)
- Text: `text-indigo-200`, headings `text-white`
- Top border: `border-t-4 border-indigo-400` — clay feel
- Footer bottom: copyright in `text-indigo-400`

---

## Component Implementation Notes

### Ant Design Integration

```tsx
// apps/web/src/lib/providers.tsx — already configured
// Override Ant Design tokens for clay feel:
<ConfigProvider
  theme={{
    token: {
      colorPrimary: '#4F46E5',
      colorSuccess: '#22C55E',
      borderRadius: 16,
      fontFamily: "'Comic Neue', sans-serif",
    },
    components: {
      Button: {
        borderRadius: 12,
        controlHeight: 44, // touch target minimum
      },
      Card: {
        borderRadius: 20,
      },
      Tabs: {
        borderRadius: 12,
      },
    },
  }}
>
```

### Client vs Server Components

| Component | Type | Reason |
|-----------|------|--------|
| `page.tsx` | Server Component | SEO, static render |
| `Navbar.tsx` | Client (`'use client'`) | Scroll detection, mobile drawer state |
| `HeroSection.tsx` | Server Component | No interactivity needed |
| `StatsBar.tsx` | Client (`'use client'`) | Count-up animation (IntersectionObserver) |
| `CourseCatalog.tsx` | Server Component | Static card grid |
| `ProgressDemo.tsx` | Client (`'use client'`) | Tab switching, chart interaction |
| `TestimonialsSection.tsx` | Client (`'use client'`) | Carousel on mobile |
| `EnrollCTA.tsx` | Server Component | Static |

### Icons

Use **Lucide React** (already common in Next.js projects) — never emoji as icons:
```bash
npm install lucide-react
```

Key icons needed:
- `BookOpen` — IELTS card
- `Headphones` — TOEIC card
- `CheckCircle` — feature list
- `TrendingUp` — progress section
- `Star` — testimonials (filled, gold)
- `ArrowRight` — CTAs
- `Menu` — mobile hamburger

### next/image

All images must use `<Image>` from `next/image`:
```tsx
import Image from 'next/image'
// Avatar images, device mockup screenshot
// Configure next.config.js for any external image hosts
```

---

## Responsive Breakpoints

| Breakpoint | Layout changes |
|-----------|----------------|
| 375px (mobile) | Single column; catalog horizontal scroll; nav collapses to hamburger |
| 768px (tablet) | 2-column catalog grid; hero stacks vertically |
| 1024px (desktop) | Full 2-col hero; 3-col catalog; side-by-side progress demo |
| 1440px (wide) | Max-width container `max-w-7xl mx-auto px-6` centers content |

---

## Accessibility Checklist

- [ ] All SVG icons have `aria-hidden="true"` (decorative) or `aria-label` (functional)
- [ ] CTA buttons: `aria-label` on icon-only variants
- [ ] Color contrast: all text on clay cards verified 4.5:1 (indigo-800 on indigo-100 = ~7:1)
- [ ] Focus rings: `focus-visible:ring-4 focus-visible:ring-indigo-400` on interactive elements
- [ ] Skip link: `<a href="#main-content">Skip to content</a>` at top of page
- [ ] `prefers-reduced-motion`: wrap all animation classes with media query check
- [ ] Carousel: keyboard navigable (Ant Design Carousel handles this)
- [ ] All images: descriptive `alt` text
- [ ] Form inputs (future): labels with `htmlFor`

---

## File Checklist (what to create)

```
apps/web/src/app/page.tsx                          ← UPDATE (currently placeholder)
apps/web/src/app/_components/landing/
  ├── Navbar.tsx                                   ← CREATE
  ├── HeroSection.tsx                              ← CREATE
  ├── StatsBar.tsx                                 ← CREATE
  ├── CourseCatalog.tsx                            ← CREATE
  ├── ProgressDemo.tsx                             ← CREATE
  ├── TestimonialsSection.tsx                      ← CREATE
  ├── HowItWorks.tsx                               ← CREATE
  ├── EnrollCTA.tsx                                ← CREATE
  └── Footer.tsx                                   ← CREATE
apps/web/src/app/globals.css                       ← ADD float keyframe + font import
```

---

## Anti-patterns to Avoid

- No emoji used as icons (use Lucide SVG only)
- No `animate-bounce` on decorative elements (distracting)
- No transparent/glassmorphism cards — clay is **opaque**
- No `<img>` tags — always `next/image`
- No layout shift from async content — reserve space with `min-h`
- No hard drop shadows (use soft multi-layer shadows for clay feel)
- No Times New Roman / system serif — always Baloo 2 + Comic Neue

---

## Implementation Order

1. Add fonts to `apps/web/src/app/layout.tsx` (Google Fonts import + body className)
2. Add float keyframe to `globals.css`
3. Update Ant Design ConfigProvider tokens in `providers.tsx`
4. Build `Navbar.tsx` (client, with mobile drawer)
5. Build `HeroSection.tsx` (static, with floating badge animations)
6. Build `CourseCatalog.tsx` (clay test cards grid)
7. Build `ProgressDemo.tsx` (tabbed interactive demo)
8. Build `StatsBar.tsx` + `HowItWorks.tsx` + `TestimonialsSection.tsx`
9. Build `EnrollCTA.tsx` + `Footer.tsx`
10. Assemble in `page.tsx`
11. Verify responsive at 375 / 768 / 1024 / 1440px

---

*Last updated: 2026-03-07*
*Based on: init-plan.md · dabase-init-plan.md · api-and-ui-integration-plan.md*
