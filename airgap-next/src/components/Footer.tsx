const footerLinks = [
  { href: "#courses", label: "Courses" },
  { href: "#membership", label: "Membership" },
  { href: "#reading", label: "Reading" },
  { href: "/about", label: "About" },
  { href: "mailto:hello@airgap.life", label: "Contact" },
];

export function Footer() {
  return (
    <footer className="bg-ink px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center">
        <div className="font-display text-4xl text-parchment">
          airgap<span className="text-rust">.</span>life
        </div>
        <p className="font-body text-sm italic text-fog">
          &ldquo;The best time to learn a skill was ten years ago. The second
          best time is now.&rdquo;
        </p>
        <ul className="flex flex-wrap justify-center gap-8">
          {footerLinks.map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className="font-ui text-xs uppercase tracking-wide text-[#6b6055] transition-colors hover:text-parchment"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="font-ui text-xs text-[#4a4438]">
          © 2026 airgap.life — made with intention, offline.
        </p>
      </div>
    </footer>
  );
}
