# airgap.life — Project Status & Roadmap

## The goal

A weekly skills-education site dedicated to offline, hands-on learning. Each week publishes one course (free or paid) covering leatherwork, sewing, guitar, painting, woodwork, handyman skills, etc. Every course follows a four-step structure: **what you need → core techniques → starter project → pathway to mastery**. Revenue via a £8/month membership that unlocks all past and future courses.

---

## What's been built

### 1. Static prototype (`/Users/joelharvey/Projects/airgap.life/`)
Plain HTML/CSS — no build step, deployable anywhere.

- `index.html` — full homepage: nav, hero, manifesto, featured course, 4-step explainer, 8-course catalogue, membership pricing, reading shelf, footer
- `courses/leatherwork/index.html` — full leatherwork course (all 4 steps, tool list, cut list, mastery track, sidebar)
- `css/styles.css` + `courses/leatherwork/course.css` — warm craft design system (Caveat + Quicksand fonts, rust/forest/parchment/cream palette)
- UX Pro Max applied: SVG icons (no emoji), focus rings, cursor-pointer, prefers-reduced-motion, 44px touch targets

### 2. Next.js app (`/Users/joelharvey/Projects/airgap-next/`) ← active project
Next.js 16, TypeScript, Tailwind v4, framer-motion. **Requires Node ≥ 22** (`nvm use 22`).

**Routes:**
- `/` — animated homepage
- `/courses/leatherwork` — full leatherwork course page

**Components built:**
| Component | What it does |
|---|---|
| `Nav.tsx` | Sticky nav, slides down on load (framer-motion) |
| `Hero.tsx` | Word-by-word staggered headline, CTA buttons with hover lift |
| `Manifesto` | Scroll-reveal grid section |
| `Featured` | This week's highlighted course card |
| `Pathway` | 4-step explainer grid |
| `Catalogue` | Animated course card grid (spring hover, staggered entrance) |
| `Membership` | Free vs paid pricing cards |
| `ReadingShelf` | Infinite marquee book shelf |
| `Footer` | Standard footer |
| `Reveal` / `RevealGroup` | Reusable scroll-reveal primitives |
| `CourseHero` | Course page header with animated icon |
| `CourseContent` | Full 4-step course content |
| `CourseSidebar` | Sticky nav, membership CTA, "up next" |
| `ToolIcons` | Inline SVG icon components |

**Design system:**
- Fonts: Caveat (headings) + Quicksand (body) via `next/font/google`
- Palette: cream `#F6F0E4`, rust `#B85C38`, forest `#3B5249`, ink `#2C2416`, parchment `#EDE4D0`
- Paper grain texture overlay
- Tailwind v4 custom tokens in `globals.css`

---

## To reach the full end state

### ✅ Priority 1 — Deploy — DONE

- [x] Deployed to Netlify (`netlify.toml` added, Node 22 pinned)
- [x] `airgap.life` domain connected

### ✅ Priority 2 — Authentication & Membership — DONE (needs env vars)

**Code complete. Activate by filling in `.env.local` (copy from `.env.local.example`).**

- [x] `@clerk/nextjs` + `stripe` installed
- [x] `ClerkProvider` wraps layout
- [x] `/sign-in` and `/sign-up` pages
- [x] `src/proxy.ts` (Next.js 16 middleware) — protects `/account/*`
- [x] `/api/checkout` — creates Stripe Checkout session
- [x] `/api/webhooks/stripe` — sets `publicMetadata.membershipStatus` in Clerk on subscription events
- [x] `MemberGate` component — blurs steps 2/3/4 for non-members, shows checkout CTA
- [x] Nav shows `UserButton` when signed in, Join/Sign in when not
- [x] Leatherwork course: step 1 free, steps 2–4 gated

**To activate:**
1. Create [Clerk app](https://clerk.com) → copy keys into `.env.local`
2. Create [Stripe](https://stripe.com) account → create £8/month product → copy `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID`
3. Add Netlify env vars (Site settings → Environment variables) — same keys as `.env.local`
4. Add Stripe webhook: `https://www.airgap.life/api/webhooks/stripe` → events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → copy `STRIPE_WEBHOOK_SECRET` into Netlify env vars

### Priority 3 — Course pages (2–5 days per course)

7 courses are listed in the catalogue but only leatherwork has a full page. Need to create:

- [ ] `/courses/guitar` — Acoustic Guitar from Zero (members)
- [ ] `/courses/sewing` — Sewing: A Practical Start (members)
- [ ] `/courses/home-repairs` — Home Repairs You Should Know (members)
- [ ] `/courses/watercolour` — Watercolour for Absolute Beginners (members)
- [ ] `/courses/growing-food` — Growing Food in Small Spaces (free)
- [ ] `/courses/reading` — Reading Deeply Again (free)
- [ ] `/courses/joinery` — Hand-Cut Joinery Basics (members)

**Reuse the existing pattern:** `CourseHero` + `CourseContent` + `CourseSidebar` — each course only needs its own content module.

Consider extracting course data to `src/data/courses.ts` (typed objects) and generating pages via `generateStaticParams` — one template, many pages.

### Priority 4 — CMS for weekly content (2–3 days setup)

Hardcoded content won't scale. Options (best → most complex):

| Option | Effort | Best for |
|---|---|---|
| **Markdown files in `/content`** | Low | Technical owner, git-based publishing |
| **[Sanity.io](https://sanity.io)** | Medium | Non-technical co-author, rich content |
| **[Contentful](https://contentful.com)** | Medium | Same as Sanity, more enterprise-y |
| **Notion + Notion API** | Low–medium | Already use Notion |

Recommended: **Markdown + MDX** to start. Zero cost, version-controlled, no external dependency. Migrate to Sanity when a second person needs to publish.

### Priority 5 — Email list (1 day)

Each weekly course needs a way to notify subscribers. Options:

- **[Buttondown](https://buttondown.email)** — minimal, developer-friendly, free to 100 subscribers, £9/mo after
- **[Beehiiv](https://beehiiv.com)** — more polished, free to 2,500 subscribers
- **[Mailchimp](https://mailchimp.com)** — free to 500, industry standard but bloated

Add a simple email capture form to the hero and footer. On submission: `POST` to Buttondown/Beehiiv API. Trigger a "new course this week" email every time a new course goes live.

### Priority 6 — Community (optional, later)

"Community access" is listed as a membership benefit. Options:

- **Discord server** (free) — easiest, most people already have it
- **Circle.so** — paid forum platform, cleaner than Discord for this audience
- **Discourse** (self-hosted) — free but ops overhead

Discord is the pragmatic starting point. Add an invite link behind the membership check.

---

## Content maintenance

### Weekly rhythm (each Monday or Sunday night)

| Task | Time | Detail |
|---|---|---|
| Write course content | 3–5 hrs | Follow the 4-step template: gear → techniques → project → mastery |
| Create course MDX file | 30 min | Add to `/content/courses/YYYY-MM-DD-slug.mdx`, update `featured: true` in frontmatter |
| Update featured course | 5 min | Change `featured` flag — if using MDX, this auto-updates the homepage |
| Send email to list | 20 min | Short intro + link to course, goes to all subscribers |
| Post to social (optional) | 10 min | Single excerpt or photo — drives discovery |

### Course content template (4-step structure)

Every course needs these four sections. Same structure every time — readers learn to expect it.

```
Step 01 — What you need to get started
  - Honest tool/materials list with prices
  - Budget tiers (minimum viable / better / full setup)
  - Supplier recommendations (UK, US, AU)
  - What to skip for now

Step 02 — The essential techniques
  - 3–5 fundamental skills only
  - Practise-on-scrap instructions before the real project
  - Common mistakes and how to avoid them

Step 03 — The starter project
  - One concrete, completable project
  - Step-by-step assembly in numbered order
  - Expected time
  - What "good enough" looks like

Step 04 — Pathway to mastery
  - 4-level progression (beginner → competent → skilled → expert)
  - Timeframes for each level
  - 1–2 book recommendations
  - Community / school recommendations
```

### Evergreen maintenance (monthly / quarterly)

| Task | Frequency | Detail |
|---|---|---|
| Check supplier links | Monthly | Suppliers go out of stock or close — verify recommended sources still work |
| Update tool prices | Quarterly | Budgets drift — keep the numbers honest |
| Review membership price | Quarterly | £8/mo is launch price — revisit once traffic and costs are clearer |
| Rotate "this week's course" | Weekly | The featured slot on the homepage — update frontmatter flag |
| Respond to community questions | Weekly | If Discord active — course corrections, technique clarifications |

### Content that lives forever (write once, maintain rarely)

- About page — the airgap philosophy, who it's for
- FAQ — payment, cancellation, course format
- Privacy policy + terms (needed before taking payments)
- Each course page — update if tool recommendations change, otherwise stable

---

## Tech debt to address before launch

- [ ] Replace hardcoded course data in `Catalogue.tsx` with a data file (`src/data/courses.ts`)
- [ ] `ReadingShelf` marquee: add `motion.div` pause-on-hover (CSS `animation-play-state: paused` on group-hover)
- [ ] Mobile nav: currently hidden below `md` breakpoint — add a hamburger/drawer
- [ ] `og:image` meta tags — add per-course Open Graph images for social sharing
- [ ] `sitemap.xml` — auto-generated by Next.js `MetadataRoute.Sitemap`, needed for SEO
- [ ] Analytics — add [Plausible](https://plausible.io) (privacy-respecting, £9/mo) or Vercel Analytics (free tier)
- [ ] Error boundary on framer-motion — wrap animated sections so a JS error doesn't blank the page

---

## File locations

```
/Users/joelharvey/Projects/
├── airgap.life/          ← original static prototype (can archive)
│   ├── index.html
│   ├── css/styles.css
│   └── courses/leatherwork/
│
└── airgap-next/          ← active Next.js project
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx       ← fonts, metadata
    │   │   ├── globals.css      ← Tailwind v4, design tokens
    │   │   ├── page.tsx         ← homepage
    │   │   └── courses/
    │   │       └── leatherwork/page.tsx
    │   ├── components/
    │   │   ├── Nav.tsx
    │   │   ├── Hero.tsx
    │   │   ├── Sections.tsx     ← Manifesto, Featured, Pathway, Membership
    │   │   ├── Catalogue.tsx
    │   │   ├── ReadingShelf.tsx
    │   │   ├── Footer.tsx
    │   │   ├── Reveal.tsx       ← scroll animation primitives
    │   │   └── course/
    │   │       ├── CourseHero.tsx
    │   │       ├── CourseContent.tsx
    │   │       ├── CourseSidebar.tsx
    │   │       └── ToolIcons.tsx
    │   └── lib/utils.ts         ← cn() helper
    └── .claude/launch.json
```

---

*Last updated: June 2026*
