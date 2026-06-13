import { Knife, Hammer, Needle, Ruler } from "./ToolIcons";
import type { ReactNode } from "react";

function StepHeader({ pill, title }: { pill: string; title: string }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <span className="shrink-0 rounded-sm bg-rust px-2.5 py-1 font-ui text-[0.7rem] uppercase tracking-[0.12em] text-paper">
        {pill}
      </span>
      <h2 className="font-display text-4xl font-bold text-ink sm:text-5xl">
        {title}
      </h2>
    </div>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 mt-8 font-display text-3xl font-bold text-ink">
      {children}
    </h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 max-w-[68ch] font-body text-ink">{children}</p>;
}

function Callout({
  variant,
  title,
  children,
}: {
  variant: "tip" | "note";
  title: string;
  children: ReactNode;
}) {
  const styles =
    variant === "tip"
      ? "bg-[#f0ebe0] border-warmtan"
      : "bg-[#e8f0e9] border-forest";
  return (
    <div className={`my-6 border-l-[3px] px-6 py-5 ${styles}`}>
      <h4 className="mb-1.5 font-display text-xl text-ink">{title}</h4>
      <p className="font-body text-sm leading-relaxed text-fog">{children}</p>
    </div>
  );
}

const tools = [
  {
    Icon: Knife,
    h: "Swivel knife or sharp craft knife",
    p: "For cutting your leather to shape. A Stanley knife with a fresh blade is fine to start. A swivel knife comes later if you want to carve patterns.",
    b: "Budget: £5–8",
  },
  {
    Icon: Hammer,
    h: "Pricking iron (4mm spacing) + mallet",
    p: "Makes the stitch holes. A wooden or rubber mallet works. Don't use a metal hammer — it'll damage the iron over time.",
    b: "Budget: £12–18 for both",
  },
  {
    Icon: Needle,
    h: "Two blunt harness needles",
    p: "Saddle-stitch uses two needles simultaneously — one on each end of a single thread. Blunt tips prevent piercing the thread accidentally.",
    b: "Budget: £3–5 for a pack",
  },
  {
    Icon: Ruler,
    h: "Metal ruler + cutting mat",
    p: "You likely have these already. If not, a 30cm steel ruler and an A3 cutting mat. Never cut against a plastic ruler.",
    b: "Budget: £10–15 if buying new",
  },
];

const techniques = [
  {
    h: "1. Cutting clean lines",
    p: "Leather is unforgiving — a wobbly cut is permanent. The key is a fresh blade, a metal ruler, and two or three light passes rather than one heavy cut. Let the knife do the work. Practise on a scrap: cut a 10×5cm rectangle with square corners before moving on.",
  },
  {
    h: "2. Punching stitch holes",
    p: "Mark your stitch line 3mm from the edge. Hold the pricking iron vertical, not angled — angled holes create slanted stitches. One firm strike with the mallet. The holes should go cleanly through in one hit.",
  },
  {
    h: "3. The saddle stitch",
    p: "This is the stitch that holds everything. Unlike machine stitching, a broken saddle-stitch thread doesn't unravel — each stitch locks the previous one. Thread a needle on each end, pass left through the first hole, then cross the right needle through the same hole. Pull both sides equally taut. Repeat.",
  },
];

const assembly = [
  "Cut all three pieces. Check corners are square.",
  "Skive (thin) the edges of the card pockets so they don't bulk up when folded.",
  "Mark and punch stitch holes along the bottom and sides of each card pocket.",
  "Position each pocket on the outer shell. Use binder clips to hold while you stitch — no glue needed yet.",
  "Saddle-stitch each pocket in place. Lock your stitches at start and end by backstitching two holes.",
  "Trim any uneven edges with a fresh blade against a ruler.",
  "Burnish the edges: wet lightly, rub with smooth hardwood until the fibres compact and shine.",
  "Fold in half, apply gentle pressure, leave flat under a heavy book overnight.",
];

const mastery = [
  {
    done: true,
    h: "Beginner — you're here",
    p: "Straight cuts, saddle stitch, simple flat construction. You can make a wallet, a keychain, a simple bookmark.",
  },
  {
    h: "Competent — 3–6 months",
    p: "Gussets, box stitching, edge dyeing, rivets and snaps. Projects: a pouch, a belt, a glasses case.",
  },
  {
    h: "Skilled — 1–2 years",
    p: "Pattern drafting, bag construction, lining, hardware fitting. Projects: a messenger bag, a tool roll, a structured handbag.",
  },
  {
    h: "Expert — 3+ years",
    p: "Wet moulding, carving, dyeing, saddlery-grade work. Projects: custom holsters, briefcases, bespoke commissions.",
  },
];

export function CourseContent() {
  return (
    <article className="min-w-0">
      {/* STEP 1 */}
      <section id="step-1">
        <StepHeader pill="Step 01" title="What you need to get started" />
        <P>
          The leatherwork industry is full of expensive tools marketed at
          beginners who don&apos;t know better yet. Here&apos;s the honest list —
          what actually matters, and why.
        </P>
        <H3>The four tools that do everything</H3>
        <div className="my-5 flex flex-col gap-4">
          {tools.map((t) => (
            <div
              key={t.h}
              className="flex gap-4 border border-parchment bg-paper p-5"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                <t.Icon />
              </div>
              <div>
                <h4 className="mb-1 font-display text-xl text-ink">{t.h}</h4>
                <p className="mb-1.5 font-body text-sm leading-relaxed text-fog">
                  {t.p}
                </p>
                <span className="font-ui text-xs font-medium text-rust">
                  {t.b}
                </span>
              </div>
            </div>
          ))}
        </div>
        <Callout variant="tip" title="Skip these for now">
          Edge bevellers, stitching chisels, wing dividers, bone folders,
          burnishing wheels — you&apos;ll see these in starter kits. They&apos;re
          real tools you&apos;ll eventually want. But not yet. Get one project
          done first.
        </Callout>
        <H3>The leather</H3>
        <P>
          Buy <strong>vegetable-tanned leather, 2–2.5mm thick</strong>. This is
          the traditional stuff — stiffer, ages beautifully, and takes a
          burnished edge without any fuss. For a first wallet you need a piece
          roughly <strong>30cm × 20cm</strong>.
        </P>
        <div className="my-6 border border-warmtan bg-parchment px-6 py-5">
          <h4 className="mb-3 font-display text-xl text-ink">
            Where to buy (UK)
          </h4>
          <ul className="mb-3 list-disc pl-5 font-body text-sm text-fog">
            <li>
              <strong>Abbey England</strong> — best quality veg-tan in the UK
            </li>
            <li>
              <strong>Le Prevo Leathers</strong> — good starter packs, fast
              delivery
            </li>
            <li>
              <strong>Rocky Mountain Leather Supply</strong> — if you&apos;re in
              North America
            </li>
          </ul>
          <p className="font-body text-sm italic text-fog">
            Avoid Amazon for leather. The listings are inconsistent and you have
            no way to check the grade.
          </p>
        </div>
      </section>

      <hr className="my-10 border-parchment" />

      {/* STEP 2 */}
      <section id="step-2">
        <StepHeader pill="Step 02" title="The essential techniques" />
        <P>
          Three things to learn before you start the project. Spend 20 minutes
          on each.
        </P>
        {techniques.map((t, i) => (
          <div
            key={t.h}
            className={i === 0 ? "" : "border-t border-parchment pt-5"}
          >
            <H3>{t.h}</H3>
            <P>{t.p}</P>
          </div>
        ))}
        <Callout variant="note" title="How long does this take to learn?">
          Your first 30cm of stitching will look rough. Your second length will
          be better. By the end of your first wallet, it&apos;ll be good.
          That&apos;s the normal curve — don&apos;t skip practising on scrap
          first.
        </Callout>
      </section>

      <hr className="my-10 border-parchment" />

      {/* STEP 3 */}
      <section id="step-3">
        <StepHeader pill="Step 03" title="The project: a slim bifold wallet" />
        <P>
          Simple, useful, and genuinely impressive to make by hand. This design
          holds four to six cards and folded notes — slim enough for a front
          pocket.
        </P>
        <div className="my-6 border border-warmtan bg-parchment p-6">
          <h4 className="mb-4 font-display text-xl text-ink">Cut list</h4>
          <div className="flex flex-col gap-2">
            {[
              { l: "Outer shell", d: "19cm × 9.5cm", q: "× 1" },
              { l: "Card pockets", d: "9cm × 7.5cm", q: "× 2" },
            ].map((c) => (
              <div
                key={c.l}
                className="flex items-center gap-4 border-b border-bark/20 py-2 font-ui text-sm"
              >
                <span className="flex-1 font-medium">{c.l}</span>
                <span className="text-fog tabular-nums">{c.d}</span>
                <span className="w-12 text-right font-medium text-rust">
                  {c.q}
                </span>
              </div>
            ))}
          </div>
        </div>
        <H3>Assembly order</H3>
        <ol className="mb-6 list-decimal pl-6 font-body">
          {assembly.map((s) => (
            <li key={s} className="py-1.5 leading-relaxed text-ink">
              {s}
            </li>
          ))}
        </ol>
        <Callout variant="tip" title="The most common beginner mistake">
          Rushing the edge finishing. Unburnished edges look cheap and feel
          rough. Spend the extra ten minutes — it&apos;s the thing people notice
          first.
        </Callout>
      </section>

      <hr className="my-10 border-parchment" />

      {/* STEP 4 */}
      <section id="step-4">
        <StepHeader pill="Step 04" title="Your pathway to mastery" />
        <P>
          You&apos;ve made a wallet. Here&apos;s where leatherwork can take you —
          at whatever pace suits you.
        </P>
        <div className="relative my-6 pl-10">
          <div className="absolute bottom-4 left-[14px] top-4 w-0.5 bg-parchment" />
          {mastery.map((m) => (
            <div key={m.h} className="relative mb-6 flex gap-5">
              <div
                className={`-ml-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-ui text-xs font-bold ${
                  m.done
                    ? "border-forest bg-forest text-cream"
                    : "border-warmtan bg-parchment text-fog"
                }`}
              >
                {m.done ? "✓" : mastery.indexOf(m) + 1}
              </div>
              <div>
                <h4 className="mb-1 font-display text-xl text-ink">{m.h}</h4>
                <p className="font-body text-sm leading-relaxed text-fog">
                  {m.p}
                </p>
              </div>
            </div>
          ))}
        </div>
        <H3>Communities worth joining</H3>
        <ul className="my-3 list-disc pl-5 font-body text-fog">
          <li>
            <strong className="text-ink">r/leathercraft</strong> — large,
            helpful, honest feedback on your work
          </li>
          <li>
            <strong className="text-ink">The Leather Workers Forum</strong> —
            deep archives of technique discussions
          </li>
          <li>
            <strong className="text-ink">Local saddlery schools</strong> — a
            one-day class in person is worth months of solo practice
          </li>
        </ul>
      </section>
    </article>
  );
}
