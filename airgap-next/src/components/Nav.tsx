"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";

const links = [
  { href: "/#courses", label: "Courses" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#reading", label: "Reading List" },
];

export function Nav() {
  const { isSignedIn, isLoaded } = useUser();

  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 border-b border-parchment bg-cream/90 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-3xl font-bold text-ink">
          airgap<span className="text-rust">.</span>life
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="inline-flex min-h-[44px] items-center font-ui text-sm font-medium uppercase tracking-wide text-fog transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}

          {isLoaded && !isSignedIn && (
            <>
              <li>
                <a
                  href="/#membership"
                  className="rounded-sm bg-rust px-4 py-2 font-ui text-sm font-medium uppercase tracking-wide text-paper transition-colors hover:bg-bark"
                >
                  Join
                </a>
              </li>
              <li>
                <a
                  href="/sign-in"
                  className="font-ui text-sm text-fog transition-colors hover:text-ink"
                >
                  Sign in
                </a>
              </li>
            </>
          )}

          {isLoaded && isSignedIn && (
            <li>
              <UserButton
                appearance={{ elements: { avatarBox: "w-9 h-9" } }}
              />
            </li>
          )}
        </ul>
      </div>
    </motion.nav>
  );
}
