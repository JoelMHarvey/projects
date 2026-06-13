const base = {
  width: 32,
  height: 32,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "var(--color-bark)",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Knife() {
  return (
    <svg {...base}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

export function Hammer() {
  return (
    <svg {...base}>
      <path d="M15 12l-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9" />
      <path d="M17.64 15 22 10.64" />
      <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 5.57a5.1 5.1 0 0 0-3.18-1.51h-.54l2.08 2.08a2.12 2.12 0 0 1 0 3 2.12 2.12 0 0 1-3 0L9.28 7.06A5.01 5.01 0 0 0 9 9.5V10c0 .85.33 1.65.93 2.25l1.25 1.25" />
    </svg>
  );
}

export function Needle() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function Ruler() {
  return (
    <svg {...base}>
      <path d="M3 21 21 3" />
      <path d="M3 21h6l12-12v6L3 21z" />
      <path d="m7.5 16.5 3-3M10.5 13.5l3-3" />
    </svg>
  );
}
