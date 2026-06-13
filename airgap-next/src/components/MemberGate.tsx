"use client";

import { useUser } from "@clerk/nextjs";
import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";

type Props = {
  children: ReactNode;
  /** Step number shown in the lock label */
  step: number;
};

function isMember(user: ReturnType<typeof useUser>["user"]) {
  return user?.publicMetadata?.membershipStatus === "active";
}

export function MemberGate({ children, step }: Props) {
  const { isLoaded, isSignedIn, user } = useUser();
  const [loading, setLoading] = useState(false);

  // While Clerk loads, render a neutral placeholder to avoid layout shift
  if (!isLoaded) {
    return <div className="h-48 animate-pulse rounded bg-parchment" />;
  }

  if (isSignedIn && isMember(user)) {
    return <>{children}</>;
  }

  async function handleCheckout() {
    setLoading(true);
    const res = await fetch("/api/checkout", { method: "POST" });
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <div className="relative my-8 overflow-hidden border border-warmtan bg-parchment">
      {/* blurred preview of the content */}
      <div className="pointer-events-none select-none blur-sm opacity-40 px-8 py-10">
        {children}
      </div>

      {/* lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-parchment/80 px-6 py-10 text-center backdrop-blur-[2px]">
        <div className="mb-3 font-ui text-xs uppercase tracking-[0.14em] text-rust">
          Step {String(step).padStart(2, "0")} — Members only
        </div>
        <h3 className="mb-2 font-display text-3xl text-ink">
          Unlock with membership
        </h3>
        <p className="mb-6 max-w-xs font-body text-sm text-fog">
          £8/month gives you every course — past and future — plus project
          templates and the full mastery pathways.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <motion.button
            whileHover={{ y: -2 }}
            disabled={loading}
            onClick={handleCheckout}
            className="cursor-pointer rounded-sm bg-rust px-7 py-3 font-ui text-sm font-medium text-paper transition-colors hover:bg-bark disabled:opacity-60"
          >
            {loading ? "Redirecting…" : "Join for £8/month"}
          </motion.button>
          {!isSignedIn && (
            <a
              href="/sign-in"
              className="font-ui text-sm text-fog underline hover:text-ink"
            >
              Sign in if you&apos;re already a member
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
