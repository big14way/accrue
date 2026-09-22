"use client";
import { useLiveStats } from "@/lib/useLiveStats";
import { Hero } from "@/components/landing/Hero";
import { Problem, Features, Flow, Guarantees, Drills, Monad, Stack, CTA } from "@/components/landing/Sections";

export default function Landing() {
  const stats = useLiveStats(24, 5000);
  return (
    <>
      <Hero stats={stats} />
      <Problem />
      <Features stats={stats} />
      <Flow />
      <Guarantees />
      <Drills />
      <Monad />
      <Stack />
      <CTA />
    </>
  );
}
