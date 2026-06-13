"use client";

import { motion } from "framer-motion";
import { Scissors } from "lucide-react";
import { Reveal, RevealGroup, revealItemVariants } from "./Reveal";

/* ============ MANIFESTO ============ */
const manifesto = [
  {
    h: "The scroll does nothing",
    p: "Forty minutes on your phone and you have nothing to show for it. An hour at a workbench and you have a stitch, a chord, a joint that fits.",
  },
  {
    h: "Skills are cumulative",
    p: "Every session builds on the last. After six months of guitar you can play songs. After six months of scrolling you can scroll faster.",
  },
  {
    h: "The hard part is starting",
    p: "What tools? What materials? How do I not waste money on rubbish? We answer that before you spend a penny.",
  },
  {
    h: "Mastery is the point",
    p: "We don't stop at \"try it once.\" Every course maps the full road — beginner, competent, good, excellent. You choose how far to go.",
  },
];

export function Manifesto() {
  return (
    <section className="bg-forest px-6 py-20 text-cream sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="font-display text-5xl font-bold text-cream">
            Why airgap?
          </h2>
        </Reveal>
        <RevealGroup className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {manifesto.map((m) => (
            <motion.div
              key={m.h}
              variants={revealItemVariants}
              className="border-t-2 border-warmtan pt-4"
            >
              <h4 className="mb-2 font-display text-2xl text-warmtan">{m.h}</h4>
              <p className="font-body text-sm leading-relaxed text-[#c8bfae]">
                {m.p}
              </p>
            </motion.div>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ============ FEATURED ============ */
const pillars = [
  "What to buy & where",
  "Cutting & skiving",
  "Saddle-stitch basics",
  "Your starter project",
  "Edge finishing",
  "Pathway to mastery",
];

export function Featured() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="mb-2 font-ui text-xs uppercase tracking-[0.14em] text-rust">
            This week&apos;s course
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="grid grid-cols-1 overflow-hidden border border-parchment bg-paper md:grid-cols-2">
            <div className="relative flex min-h-[320px] items-center justify-center bg-parchment">
              <span className="absolute left-6 top-6 bg-forest px-3 py-1 font-ui text-[0.7rem] uppercase tracking-[0.1em] text-cream">
                Free this week
              </span>
              <Scissors
                className="h-28 w-28 text-bark opacity-40"
                strokeWidth={1}
              />
            </div>
            <div className="flex flex-col justify-center p-8 sm:p-12">
              <p className="mb-1 font-ui text-xs uppercase tracking-[0.14em] text-rust">
                Leatherwork — Lesson 01
              </p>
              <h2 className="mb-4 font-display text-5xl font-bold text-ink">
                Your first leather wallet
              </h2>
              <p className="mb-6 font-body text-fog">
                No experience needed. You&apos;ll learn which leather to buy
                (and which to avoid), the four hand tools that do 90% of all
                leatherwork, and finish with a slim bifold wallet you&apos;ll
                actually use.
              </p>
              <ul className="mb-8 grid grid-cols-1 gap-y-2 sm:grid-cols-2">
                {pillars.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2 font-ui text-sm text-fog"
                  >
                    <span className="text-rust">→</span>
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mb-6 flex items-baseline gap-3">
                <span className="font-display text-3xl font-bold text-forest">
                  Free
                </span>
                <span className="font-ui text-xs text-fog">
                  No signup required this week
                </span>
              </div>
              <motion.a
                href="/courses/leatherwork"
                whileHover={{ y: -2 }}
                className="w-fit cursor-pointer rounded-sm bg-rust px-8 py-3.5 font-ui text-sm font-medium tracking-wide text-paper transition-colors hover:bg-bark"
              >
                Start the course →
              </motion.a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ============ PATHWAY ============ */
const steps = [
  {
    n: "01",
    h: "What you need to get started",
    p: "The exact tools and materials — no expensive extras, no false economy. A curated starter kit that won't let you down.",
  },
  {
    n: "02",
    h: "The essential techniques",
    p: "The small number of skills that unlock everything else. We teach them slowly, correctly, once — so you build real muscle memory.",
  },
  {
    n: "03",
    h: "A proper first project",
    p: "Something real. Something you'll finish, use, and be proud of. Not a sampler — an actual object with a purpose.",
  },
  {
    n: "04",
    h: "Your pathway to mastery",
    p: "Where to go next. Intermediate projects, advanced techniques, books to read, communities to join. A map, not just a start.",
  },
];

export function Pathway() {
  return (
    <section id="how-it-works" className="bg-parchment px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="mb-2 font-display text-5xl font-bold text-ink">
            Every course follows the same four steps
          </h2>
          <p className="mb-12 max-w-2xl font-body text-fog">
            Because starting well is the difference between a new hobby and a
            drawer full of abandoned gear.
          </p>
        </Reveal>
        <RevealGroup className="grid grid-cols-1 gap-px border-[1.5px] border-warmtan bg-warmtan sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <motion.div
              key={s.n}
              variants={revealItemVariants}
              className="bg-parchment p-7"
            >
              <div
                className="mb-3 font-display text-6xl font-bold leading-none text-transparent"
                style={{ WebkitTextStroke: "1.5px var(--color-warmtan)" }}
              >
                {s.n}
              </div>
              <h4 className="mb-2 font-display text-2xl text-ink">{s.h}</h4>
              <p className="font-body text-sm leading-relaxed text-fog">
                {s.p}
              </p>
            </motion.div>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ============ MEMBERSHIP ============ */
export function Membership() {
  return (
    <section
      id="membership"
      className="bg-ink px-6 py-24 text-center text-cream sm:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="mx-auto mb-4 max-w-md font-display text-5xl font-bold text-cream">
            One membership, every course
          </h2>
          <p className="mx-auto mb-12 max-w-xl font-body text-[#b0a898]">
            New skill every week. Unlock everything — past courses, project
            guides, the reading list, and the community of people building the
            same habit.
          </p>
        </Reveal>

        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          <Reveal delay={0.05}>
            <div className="h-full border border-[#3a3328] bg-[#231f18] p-9 text-left">
              <p className="mb-4 font-ui text-xs uppercase tracking-[0.14em] text-warmtan">
                Free
              </p>
              <div className="mb-1 font-display text-5xl font-bold text-cream">
                £0{" "}
                <span className="font-ui text-base font-normal text-fog">
                  / forever
                </span>
              </div>
              <p className="mb-8 font-body text-sm text-fog">
                One free course per month, always. No credit card.
              </p>
              <ul className="mb-8 space-y-0">
                {[
                  "1 free course per month",
                  "Weekly reading recommendations",
                  "Community access (read-only)",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 border-b border-[#3a3328] py-2 font-ui text-sm text-[#c8bfae]"
                  >
                    <span className="font-bold text-warmtan">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="w-full cursor-pointer border-[1.5px] border-[#3a3328] py-3.5 font-ui text-sm text-cream transition-colors hover:border-warmtan">
                Start free
              </button>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="h-full border border-warmtan bg-[#2e2820] p-9 text-left">
              <p className="mb-4 font-ui text-xs uppercase tracking-[0.14em] text-warmtan">
                ✦ Member
              </p>
              <div className="mb-1 font-display text-5xl font-bold text-cream">
                £8{" "}
                <span className="font-ui text-base font-normal text-fog">
                  / month
                </span>
              </div>
              <p className="mb-8 font-body text-sm text-fog">
                Every course, every week. Cancel any time.
              </p>
              <ul className="mb-8 space-y-0">
                {[
                  "Every course — past & present",
                  "Downloadable project plans & templates",
                  "Supplier & tool recommendations",
                  "Full community access",
                  "Monthly live Q&A session",
                  "Early access to new courses",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 border-b border-[#3a3328] py-2 font-ui text-sm text-[#c8bfae]"
                  >
                    <span className="font-bold text-warmtan">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <motion.button
                whileHover={{ y: -2 }}
                className="w-full cursor-pointer rounded-sm bg-rust py-3.5 font-ui text-sm font-medium text-paper transition-colors hover:bg-bark"
              >
                Join for £8/month
              </motion.button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
