"use client";

import { motion } from "framer-motion";
import { Music } from "lucide-react";

const sections = [
  { href: "#step-1", n: "01", label: "What you need" },
  { href: "#step-2", n: "02", label: "Core techniques" },
  { href: "#step-3", n: "03", label: "The wallet project" },
  { href: "#step-4", n: "04", label: "Path to mastery" },
];

export function CourseSidebar() {
  return (
    <aside className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:sticky lg:top-20 lg:grid-cols-1">
      <div className="border border-parchment bg-paper p-6">
        <h4 className="mb-4 font-display text-xl text-ink">
          What&apos;s in this course
        </h4>
        <ul>
          {sections.map((s) => (
            <li key={s.href} className="border-b border-parchment">
              <a
                href={s.href}
                className="flex min-h-[44px] items-center gap-3 py-2 font-ui text-sm text-fog transition-colors hover:text-rust"
              >
                <span className="w-6 shrink-0 text-xs font-bold text-rust">
                  {s.n}
                </span>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="border border-warmtan bg-parchment p-6">
        <h4 className="mb-2 font-display text-xl text-ink">Get everything</h4>
        <p className="font-body text-sm text-fog">
          Members get printable templates, the full tool guide, supplier
          discounts, and every course we publish.
        </p>
        <motion.a
          href="/#membership"
          whileHover={{ y: -2 }}
          className="mt-4 block cursor-pointer rounded-sm bg-rust py-3 text-center font-ui text-sm font-medium text-paper transition-colors hover:bg-bark"
        >
          Join for £8/month
        </motion.a>
        <p className="mt-3 text-center font-ui text-xs text-fog">
          Cancel any time. No fuss.
        </p>
      </div>

      <div className="border border-parchment bg-paper p-6">
        <h4 className="mb-4 font-display text-xl text-ink">Up next</h4>
        <a
          href="/#courses"
          className="flex items-center gap-3 text-ink transition-colors hover:text-rust"
        >
          <Music className="h-9 w-9 shrink-0 text-bark" strokeWidth={1.5} />
          <div>
            <span className="block font-ui text-[0.7rem] uppercase tracking-wide text-fog">
              Next week
            </span>
            <strong className="font-display text-xl">
              Acoustic Guitar from Zero
            </strong>
          </div>
        </a>
      </div>
    </aside>
  );
}
