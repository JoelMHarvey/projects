"use client";

import { motion } from "framer-motion";
import {
  Scissors,
  Hammer,
  Music,
  Palette,
  Sprout,
  BookOpen,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Reveal, RevealGroup, revealItemVariants } from "./Reveal";

type Course = {
  icon: LucideIcon;
  tag: string;
  price: "Free" | "Members";
  title: string;
  desc: string;
  href?: string;
};

const courses: Course[] = [
  {
    icon: Music,
    tag: "Music",
    price: "Members",
    title: "Acoustic Guitar from Zero",
    desc: "Your first chords, your first song, and a practice routine that actually sticks. No tab-reading required.",
  },
  {
    icon: Scissors,
    tag: "Craft",
    price: "Free",
    title: "Leatherwork — The Wallet",
    desc: "Four tools, one hide, one finished wallet. The definitive beginner's course in traditional hand-stitched leather.",
    href: "/courses/leatherwork",
  },
  {
    icon: Scissors,
    tag: "Craft",
    price: "Members",
    title: "Sewing: A Practical Start",
    desc: "Machine basics, reading a pattern, and finishing a linen tote bag you'll use every day.",
  },
  {
    icon: Wrench,
    tag: "Handyman",
    price: "Members",
    title: "Home Repairs You Should Know",
    desc: "Plaster, taps, hinges, flatpack, caulk. The fifteen jobs every homeowner should be able to do.",
  },
  {
    icon: Palette,
    tag: "Art",
    price: "Members",
    title: "Watercolour for Absolute Beginners",
    desc: "Why watercolour beats every other medium for beginners, the three brushes you need, and your first landscape.",
  },
  {
    icon: Sprout,
    tag: "Garden",
    price: "Free",
    title: "Growing Food in Small Spaces",
    desc: "Tomatoes, herbs, salad leaves — from a balcony, a windowsill, or a pocket-sized plot. A full season's plan.",
  },
  {
    icon: BookOpen,
    tag: "Mind",
    price: "Free",
    title: "Reading Deeply Again",
    desc: "How to rebuild a reading habit after years of short-form. Environment design, book selection, lasting notes.",
  },
  {
    icon: Hammer,
    tag: "Woodwork",
    price: "Members",
    title: "Hand-Cut Joinery — Basics",
    desc: "Saw, chisel, mallet, and a bench hook. The four joints that build almost everything, and a small shelf to prove it.",
  },
];

function CourseCard({ course }: { course: Course }) {
  const Icon = course.icon;
  const inner = (
    <motion.article
      variants={revealItemVariants}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="group h-full cursor-pointer overflow-hidden border border-parchment bg-paper transition-shadow hover:shadow-[0_10px_30px_rgba(44,36,22,0.12)]"
    >
      <div className="flex h-40 items-center justify-center bg-parchment">
        <Icon
          className="h-16 w-16 text-bark opacity-50 transition-transform duration-300 group-hover:scale-110"
          strokeWidth={1.25}
        />
      </div>
      <div className="px-6 pb-6 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-ui text-[0.7rem] uppercase tracking-[0.1em] text-fog">
            {course.tag}
          </span>
          <span
            className={`rounded-sm px-2.5 py-0.5 font-ui text-xs font-medium ${
              course.price === "Free"
                ? "bg-[#e8f0e9] text-forest"
                : "bg-[#f5e8e0] text-rust"
            }`}
          >
            {course.price}
          </span>
        </div>
        <h3 className="mb-1.5 font-display text-2xl font-bold text-ink">
          {course.title}
        </h3>
        <p className="font-body text-sm leading-relaxed text-fog">
          {course.desc}
        </p>
      </div>
    </motion.article>
  );

  return course.href ? (
    <a href={course.href} className="block h-full">
      {inner}
    </a>
  ) : (
    inner
  );
}

export function Catalogue() {
  return (
    <section id="courses" className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-5xl font-bold text-ink">
            All courses
          </h2>
          <a
            href="#"
            className="font-ui text-sm tracking-wide text-rust hover:underline"
          >
            View full catalogue →
          </a>
        </Reveal>

        <RevealGroup
          stagger={0.08}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {courses.map((c) => (
            <CourseCard key={c.title} course={c} />
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
