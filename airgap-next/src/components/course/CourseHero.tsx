"use client";

import { motion } from "framer-motion";
import { Scissors } from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

const meta = [
  { label: "Skill level", value: "Complete beginner" },
  { label: "Time needed", value: "3–4 hours" },
  { label: "Starter budget", value: "£35–50" },
];

export function CourseHero() {
  return (
    <header className="border-b border-warmtan bg-parchment px-6 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-6 flex flex-wrap items-center gap-2 font-ui text-xs tracking-wide text-fog">
          <a href="/" className="hover:text-rust">
            Home
          </a>
          <span>→</span>
          <a href="/#courses" className="hover:text-rust">
            Courses
          </a>
          <span>→</span>
          <span className="text-ink">Leatherwork</span>
        </nav>

        <div className="grid grid-cols-1 items-center gap-8 sm:grid-cols-[1fr_auto]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOut }}
          >
            <div className="mb-4 flex gap-2">
              <span className="rounded-sm bg-cream px-2.5 py-1 font-ui text-[0.7rem] uppercase tracking-[0.1em] text-fog">
                Craft
              </span>
              <span className="rounded-sm bg-forest px-2.5 py-1 font-ui text-[0.7rem] uppercase tracking-[0.1em] text-cream">
                Free this week
              </span>
            </div>
            <h1 className="mb-4 font-display text-6xl font-bold leading-[0.95] text-ink sm:text-7xl">
              Your first leather wallet
            </h1>
            <p className="mb-7 max-w-xl font-body text-lg font-light text-fog">
              Four hand tools. One piece of vegetable-tanned hide. One
              afternoon. You&apos;ll come away with a slim bifold wallet that
              will last twenty years — and the foundation of a skill you can
              build on for the rest of your life.
            </p>
            <div className="flex flex-wrap gap-8">
              {meta.map((m) => (
                <div key={m.label} className="flex flex-col gap-0.5">
                  <span className="font-ui text-[0.7rem] uppercase tracking-[0.1em] text-fog">
                    {m.label}
                  </span>
                  <span className="font-ui text-sm font-medium text-ink">
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
            animate={{ opacity: 0.4, scale: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: easeOut, delay: 0.2 }}
            className="hidden sm:block"
          >
            <Scissors className="h-32 w-32 text-bark" strokeWidth={1} />
          </motion.div>
        </div>
      </div>
    </header>
  );
}
