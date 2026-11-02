import type { Metadata } from "next"
import { AboutHero } from "@/components/marketing/about/AboutHero"
import { MissionProse } from "@/components/marketing/about/MissionProse"
import { Principles } from "@/components/marketing/about/Principles"
import { ProblemStats } from "@/components/marketing/about/ProblemStats"
import { StoryBand } from "@/components/marketing/about/StoryBand"
import { FinalCta } from "@/components/marketing/home/FinalCta"

export const metadata: Metadata = {
  title: "About — AccessAudit",
  description:
    "Why AccessAudit exists: make accessibility testing fast, understandable, and actionable, with WCAG 2.2 detection and AI-guided repair guidance.",
}

export default function AboutPage() {
  return (
    <main className="bg-surface-0 text-text-pri">
      <AboutHero />
      <ProblemStats />
      <MissionProse />
      <Principles />
      <StoryBand />
      <FinalCta />
    </main>
  )
}
