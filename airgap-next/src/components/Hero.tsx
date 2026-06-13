"use client";

import { motion } from "framer-motion";

const easeOut = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

const line1 = ["Put", "the", "phone", "down."];
const line2 = ["Pick", "something", "up."];

export function Hero() {
  return (
    <header className="relative overflow-hidden px-6 pb-16 pt-20 text-center sm:pt-28">
      {/* soft radial warmth */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(184,92,56,0.08),transparent_60%)]" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative mx-auto flex max-w-3xl flex-col items-center"
      >
        <motion.span
          variants={item}
          className="font-ui text-xs uppercase tracking-[0.12em] text-rust"
        >
          Vol. 01 — Week of June 16, 2026
        </motion.span>

        <motion.span
          variants={item}
          className="my-6 block h-0.5 w-12 bg-rust"
          aria-hidden
        />

        <h1 className="font-display text-6xl font-bold leading-[0.95] text-ink sm:text-7xl lg:text-8xl">
          <span className="flex flex-wrap justify-center gap-x-4">
            {line1.map((w, i) => (
              <motion.span key={i} variants={item} className="inline-block">
                {w}
              </motion.span>
            ))}
          </span>
          <span className="flex flex-wrap justify-center gap-x-4 text-rust">
            {line2.map((w, i) => (
              <motion.span key={i} variants={item} className="inline-block">
                {w}
              </motion.span>
            ))}
          </span>
        </h1>

        <motion.p
          variants={item}
          className="mt-7 max-w-xl font-body text-lg font-light text-fog"
        >
          Every week, one practical skill — taught from scratch. What to buy,
          what to practise, a real project to finish, and a road to being
          genuinely good at it.
        </motion.p>

        <motion.div
          variants={item}
          className="mt-10 flex flex-col gap-4 sm:flex-row"
        >
          <motion.a
            href="#membership"
            whileHover={{ y: -2 }}
            whileTap={{ y: 0 }}
            className="cursor-pointer rounded-sm bg-rust px-8 py-3.5 font-ui text-sm font-medium tracking-wide text-paper shadow-md transition-colors hover:bg-bark"
          >
            Join the membership
          </motion.a>
          <motion.a
            href="#courses"
            whileHover={{ y: -2 }}
            whileTap={{ y: 0 }}
            className="cursor-pointer rounded-sm border-[1.5px] border-warmtan px-8 py-3.5 font-ui text-sm font-medium tracking-wide text-ink transition-colors hover:border-ink"
          >
            Browse free courses
          </motion.a>
        </motion.div>
      </motion.div>
    </header>
  );
}
