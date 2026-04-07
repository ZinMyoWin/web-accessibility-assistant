import type { ScanIssue, ScanResponse } from "@/components/home/types"

export function formatRuleId(id: string) {
  return id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

export function getBestLocator(issue: ScanIssue): string | null {
  if (issue.rule_id === "heading-order" && issue.text_preview) {
    return `Search for heading text "${issue.text_preview}" in the Elements panel.`
  }
  if (issue.rule_id === "duplicate-id") {
    return `Search in DevTools Elements for ${issue.element}.`
  }
  if (issue.rule_id === "image-alt" && issue.text_preview) {
    return `Search for image source or label "${issue.text_preview}".`
  }
  if (issue.rule_id === "link-name" && issue.text_preview) {
    return `Search for link text "${issue.text_preview}".`
  }
  if (issue.dom_path) {
    return `Follow the DOM path ending in ${issue.dom_path.split(" > ").at(-1)}.`
  }
  return null
}

export function getTopRuleCounts(result: ScanResponse | null) {
  if (!result) {
    return []
  }

  return Object.entries(
    result.issues.reduce<Record<string, number>>((counts, issue) => {
      counts[issue.rule_id] = (counts[issue.rule_id] || 0) + 1
      return counts
    }, {})
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
}
