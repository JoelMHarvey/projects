"use client";

import { motion } from "framer-motion";
import { Reveal } from "./Reveal";

const books = [
  { title: "The Art of the Handmade", cat: "Craft & making", color: "#6B4C35" },
  { title: "The Well-Tempered Clavier", cat: "Music & practice", color: "#3B5249" },
  { title: "Four Seasons in Rome", cat: "Slow living", color: "#7A4E2D" },
  { title: "Zen and the Art of Motorcycle Maintenance", cat: "Craft & philosophy", color: "#8C6E4B" },
  { title: "A Pattern Language", cat: "Making & space", color: "#4A6741" },
  { title: "The Pleasures of the Table", cat: "Cooking & ritual", color: "#5C4033" },
  { title: "How to Read a Book", cat: "Reading deeply", color: "#2C4A3E" },
];

function Book({ b }: { b: (typeof books)[number] }) {
  return (
    <div className="w-[150px] shrink-0 text-center">
      <div
        className="mx-auto mb-3 flex h-[210px] w-[140px] items-center justify-center rounded-r-md p-3 text-center font-display text-base italic leading-tight text-white/90 shadow-[3px_3px_12px_rgba(44,36,22,0.25)]"
        style={{ background: b.color }}
      >
        {b.title}
      </div>
      <p className="font-ui text-xs leading-tight text-fog">{b.cat}</p>
    </div>
  );
}

export function ReadingShelf() {
  // duplicate the row so the marquee loops seamlessly
  const row = [...books, ...books];

  return (
    <section id="reading" className="overflow-hidden bg-cream px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="mb-3 font-display text-5xl font-bold text-ink">
            Books worth your time
          </h2>
          <p className="mb-10 max-w-xl font-body text-fog">
            Alongside each weekly course we recommend one book — something to go
            deeper, or just to sit with over a long weekend. These are the ones
            we return to.
          </p>
        </Reveal>
      </div>

      {/* Marquee — pauses on hover, respects reduced-motion via CSS */}
      <div className="group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <motion.div
          className="flex gap-8 pr-8"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          {row.map((b, i) => (
            <Book key={i} b={b} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
