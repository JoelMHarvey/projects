import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Manifesto, Featured, Pathway, Membership } from "@/components/Sections";
import { Catalogue } from "@/components/Catalogue";
import { ReadingShelf } from "@/components/ReadingShelf";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <Featured />
        <Pathway />
        <Catalogue />
        <Membership />
        <ReadingShelf />
      </main>
      <Footer />
    </>
  );
}
