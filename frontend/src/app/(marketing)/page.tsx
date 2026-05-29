import { AccessibilityBand } from "@/components/marketing/home/AccessibilityBand"
import { Features } from "@/components/marketing/home/Features"
import { FinalCta } from "@/components/marketing/home/FinalCta"
import { Hero } from "@/components/marketing/home/Hero"
import { HowItWorks } from "@/components/marketing/home/HowItWorks"
import { TrustStrip } from "@/components/marketing/home/TrustStrip"

export default function MarketingHomePage() {
  return (
    <main className="bg-surface-0 text-text-pri">
      <Hero />
      <TrustStrip />
      <Features />
      <HowItWorks />
      <AccessibilityBand />
      <FinalCta />
    </main>
  )
}
