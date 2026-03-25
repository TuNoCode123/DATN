# IELTS AI Platform - Frontend Rebuild Plan

## Design Reference: LearnHub-Style (Neo-Brutalist Education Platform)

Based on the provided screenshots, the target design features a **modern neo-brutalist / cartoon-style** UI with thick borders, rounded corners, vibrant green primary color, and playful yet professional aesthetics.

---

## Design System

### Style: Neo-Brutalist / Playful Modern

| Property | Value |
|----------|-------|
| Border style | 2-3px solid dark navy (`#1E293B`) |
| Border radius | `rounded-2xl` (16px) for cards, `rounded-full` for pills/badges |
| Shadows | Offset shadow using dark border (no blur, 4px offset) or `shadow-[4px_4px_0px_#1E293B]` |
| Cards | White bg, thick dark border, rounded-2xl |
| Hover | Subtle translate + shadow shift for neo-brutalist feel |

### Color Palette

| Role | Color | Hex | Tailwind |
|------|-------|-----|----------|
| **Primary** | Vibrant Green | `#22C55E` | `green-500` |
| **Primary Hover** | Dark Green | `#16A34A` | `green-600` |
| **Text Primary** | Dark Navy | `#1E293B` | `slate-800` |
| **Text Secondary** | Medium Gray | `#64748B` | `slate-500` |
| **Background** | Warm Cream | `#FFF8F0` | custom |
| **Surface** | White | `#FFFFFF` | `white` |
| **Border** | Dark Navy | `#1E293B` | `slate-800` |
| **Accent Section** | Light Blue | `#DBEAFE` | `blue-100` |
| **Badge/Pill BG** | Light Teal | `#CCFBF1` | `teal-100` |
| **Icon BG Pink** | Soft Pink | `#FFE4E6` | `rose-100` |
| **Icon BG Blue** | Soft Blue | `#DBEAFE` | `blue-100` |
| **Icon BG Purple** | Soft Purple | `#E9D5FF` | `purple-100` |
| **Icon BG Green** | Soft Green | `#D1FAE5` | `emerald-100` |
| **Star Yellow** | Gold | `#FBBF24` | `amber-400` |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| **Headings** | DM Sans (or Poppins) | 700-800 | 48-64px hero, 32-40px sections |
| **Body** | Inter (or Open Sans) | 400-500 | 16-18px |
| **Nav links** | Inter | 500 | 14-16px |
| **Badges/Pills** | Inter | 600 | 12-14px |
| **Stats numbers** | DM Sans | 800 | 36-48px |

### Icon System
- **Library**: Lucide React (already installed)
- **Icon boxes**: 48x48px with pastel background, rounded-xl
- **Sizes**: w-5 h-5 for nav, w-6 h-6 for cards, w-8 h-8 for features

---

## Pages to Rebuild

### 1. Landing Page (`src/app/page.tsx`) - NEW
Full marketing landing page with sections:

#### 1.1 Floating Navbar
- White bg, thick dark border (2px), rounded-2xl
- Positioned with `mx-4 mt-4` (floating effect)
- Logo: Icon + "IELTS AI" text
- Nav links: Tests, Courses, Pricing, About
- Right: "Log In" text link + "Start Free" green button
- Sticky on scroll

#### 1.2 Hero Section
- Left: Bold headline "Master IELTS, **Anytime**, **Anywhere!**" (italic green accent)
- Subtitle text in slate-500
- Two CTAs: "Start Learning Free ->" (green filled) + "Browse Tests" (outlined)
- Stats row: "10K+ Tests", "2M+ Students", "500+ Instructors"
- Right: Floating course progress card with neo-brutalist border
- Background: Warm cream (`#FFF8F0`)

#### 1.3 Popular Tests Section
- Section badge pill: "Popular Tests"
- Heading: "Explore Top-Rated Tests"
- 2x2 grid of test cards with:
  - Colored icon box (pastel bg)
  - Test title + instructor
  - Meta: lessons count, duration, students
  - Rating badge (green outlined)
- "View All Tests ->" button (dark filled, rounded-full)

#### 1.4 Why Choose Us Section
- Light gray/white bg
- Badge: "Why Choose Us"
- Heading: "Everything You Need to Succeed"
- 4-column grid of feature cards:
  - Learn at Your Pace (clock icon, pink bg)
  - AI-Powered Feedback (brain icon, blue bg)
  - Certificates (checkmark icon, purple bg)
  - Community Support (users icon, green bg)
- Each card: white bg, subtle border, rounded-2xl

#### 1.5 Student Stories / Testimonials
- Badge: "Student Stories"
- Heading: "What Our Students Say"
- 3-column grid of testimonial cards:
  - Star ratings (amber stars)
  - Quote text
  - Avatar circle + name + role
  - Neo-brutalist card style

#### 1.6 CTA Section
- Light blue background section
- White card with thick border centered
- Heading: "Ready to Start Learning?"
- Subtitle + two CTAs
- Trust badges: "No credit card required" + "Cancel anytime"

#### 1.7 Footer
- Warm cream bg
- Logo + description + social icons
- 3-column links: Tests, Company, Support
- Bottom: copyright + legal links

### 2. Learner Layout (`src/app/(learner)/layout.tsx`) - REBUILD
- Use the same floating navbar style
- Authenticated nav with user avatar
- Consistent with landing page design language

### 3. Shared Components (`src/components/landing/`)

| Component | File | Description |
|-----------|------|-------------|
| Navbar | `navbar.tsx` | Floating neo-brutalist navbar |
| Footer | `footer.tsx` | Site footer with links |
| SectionBadge | `section-badge.tsx` | Pill badge for section labels |
| FeatureCard | `feature-card.tsx` | Icon + title + description card |
| TestCard | `test-card.tsx` | Course/test listing card |
| TestimonialCard | `testimonial-card.tsx` | Student review card |
| StatsRow | `stats-row.tsx` | Numbers row (10K+, 2M+, etc.) |
| HeroCard | `hero-card.tsx` | Floating progress card in hero |
| CTASection | `cta-section.tsx` | Call-to-action section |

### 4. Update `globals.css`
- Add neo-brutalist custom colors to CSS variables
- Update primary color from indigo to green
- Add warm cream background
- Add custom utilities for neo-brutalist borders/shadows

### 5. Update `providers.tsx`
- Change Ant Design primary color to match green theme

---

## Implementation Order

1. **Phase 1: Design System** - Update `globals.css`, add custom Tailwind theme
2. **Phase 2: Shared Components** - Build all reusable landing components
3. **Phase 3: Landing Page** - Assemble the full landing page
4. **Phase 4: Learner Layout** - Rebuild with new navbar/footer
5. **Phase 5: Polish** - Responsive checks, hover states, transitions

---

## Technical Notes

- **Stack**: Next.js 16, Tailwind CSS v4, Lucide React icons
- **No new dependencies needed** - everything uses existing packages
- **Font change**: Consider adding DM Sans for headings (bolder, more playful than Poppins)
- **Keep existing**: Admin panel, auth pages, API integration untouched
- **Responsive**: Mobile-first, breakpoints at 375px, 768px, 1024px, 1440px
