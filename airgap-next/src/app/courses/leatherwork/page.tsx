import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/Reveal";
import { CourseHero } from "@/components/course/CourseHero";
import { CourseContent } from "@/components/course/CourseContent";
import { CourseSidebar } from "@/components/course/CourseSidebar";

export const metadata: Metadata = {
  title: "Leatherwork — Your First Wallet | Airgap.life",
  description:
    "Learn traditional hand-stitched leatherwork. What to buy, the four core techniques, a finished wallet, and your path to mastery.",
};

export default function LeatherworkCourse() {
  return (
    <>
      <Nav />
      <CourseHero />
      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_300px]">
          <Reveal>
            <CourseContent />
          </Reveal>
          <CourseSidebar />
        </div>
      </main>
      <Footer />
    </>
  );
}
