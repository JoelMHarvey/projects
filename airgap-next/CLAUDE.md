# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **IMPORTANT:** This is Next.js 16 — a breaking-change release. APIs, conventions, and file structure may differ from training data. Check `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Node version

**Requires Node ≥ 22.** Default system node is v16 — always activate v22 first:

```bash
nvm use 22
```

## Commands

```bash
npm run dev        # dev server (port 3000 default, use PORT=3700 to override)
npm run build      # production build — run this to catch TypeScript + route errors
npm run lint       # eslint (next/core-web-vitals + typescript)
npx tsc --noEmit   # type-check without building
```

No test suite exists yet.

## Architecture

### Rendering
All pages are **statically prerendered** (no `getServerSideProps`, no dynamic routes yet). The App Router is used (`src/app/`). Every component that uses framer-motion or React hooks must be marked `"use client"` — server components are the default.

### Design system
Tailwind v4 with custom tokens defined in `src/app/globals.css` under `@theme`. Tokens are used as Tailwind utility classes directly (e.g. `bg-rust`, `text-forest`, `border-parchment`) — **do not use hex values inline**. The full palette:

| Token | Hex | Use |
|---|---|---|
| `cream` | `#F6F0E4` | Page background |
| `parchment` | `#EDE4D0` | Section backgrounds, card backgrounds |
| `warmtan` | `#C9A97A` | Borders, accents |
| `rust` | `#B85C38` | Primary CTA, highlight colour |
| `bark` | `#7A4E2D` | Hover state for rust, icon stroke |
| `forest` | `#3B5249` | Dark section backgrounds, free-tier badge |
| `ink` | `#2C2416` | Primary text |
| `fog` | `#8C8070` | Secondary/muted text |
| `paper` | `#FDFAF4` | Card backgrounds (lighter than cream) |

Three font families, loaded via `next/font/google` in `layout.tsx` and exposed as CSS variables:
- `font-display` → Caveat (headings — handwritten, large sizes)
- `font-body` → Quicksand (body text)
- `font-ui` → DM Sans (labels, badges, small caps)

Use Tailwind utility classes `font-display`, `font-body`, `font-ui` to apply them.

### Animation
framer-motion. Two reusable primitives in `src/components/Reveal.tsx`:

- `<Reveal>` — single element fades + lifts in when scrolled into view (fires once, `useInView`)
- `<RevealGroup>` + `<RevealItem>` — parent staggers children; children use `revealItemVariants`

Any new section should wrap its heading in `<Reveal>` and its grid/list in `<RevealGroup>`. For hover interactions use `whileHover={{ y: -2 }}` with `whileTap={{ y: 0 }}` on interactive elements.

### Icons
Use **lucide-react** exclusively. No emoji in JSX. Custom craft tool icons (Knife, Hammer, Needle, Ruler) live in `src/components/course/ToolIcons.tsx` as plain SVG components using `var(--color-bark)` for stroke.

### Course pages
Route: `src/app/courses/[slug]/page.tsx`. The leatherwork course (`src/app/courses/leatherwork/`) is the reference implementation. Course pages are composed of three components:

- `CourseHero` — breadcrumb, tags, title, meta row, animated icon
- `CourseContent` — four `<section id="step-N">` blocks following the mandatory structure: gear list → techniques → project assembly → mastery track
- `CourseSidebar` — sticky on desktop, section nav + membership CTA + "up next"

Course data (title, icon, tag, price, desc, href) is currently hardcoded in `src/components/Catalogue.tsx`. When adding more than 2–3 courses, extract to `src/data/courses.ts`.

### Utility
`src/lib/utils.ts` exports `cn()` (clsx + tailwind-merge). Use it for conditional class merging.

## Auth & membership

- **Clerk v7** — `useUser()` hook for client components; `auth()` (async) from `@clerk/nextjs/server` for server/API routes. `SignedIn`/`SignedOut` components do NOT exist in v7 — use `useUser()` conditionally.
- **Membership check** — `user.publicMetadata.membershipStatus === "active"` (set by Stripe webhook). Use `<MemberGate step={N}>` to lock content.
- **Route protection** — `src/proxy.ts` (Next.js 16 calls it `proxy`, not `middleware`). Account pages protected; course gating is component-level via `MemberGate`.
- **Stripe** — instantiate `new Stripe(key)` inside route handlers, never at module level (env vars absent at build time).
- **Env vars** — see `.env.local.example`. Add same vars to Netlify site settings for production.

## Key constraints

- `"use client"` required on any component using hooks or framer-motion
- `prefers-reduced-motion` is handled globally in `globals.css` — do not add per-component motion guards
- Touch targets must be ≥ 44px height on interactive elements
- All interactive non-anchor elements need `cursor-pointer`
- Max line length for prose: `max-w-[68ch]`
