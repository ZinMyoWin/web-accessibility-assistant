import type { ScanIssue, ScanResponse } from "@/components/home/types"

export function formatRuleId(id: string) {
  return id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

export function getBestLocator(issue: ScanIssue): string | null {
  const pagePrefix = issue.page_url ? `Open ${issue.page_url}, then ` : ""
  const sourceLocation =
    issue.line != null
      ? ` Source location: line ${issue.line}${issue.column != null ? `, column ${issue.column}` : ""}.`
      : ""

  if (issue.rule_id === "heading-order" && issue.text_preview) {
    return `${pagePrefix}search for heading text "${issue.text_preview}" in the page or Elements panel.${sourceLocation}`
  }
  if (issue.rule_id === "duplicate-id") {
    return `${pagePrefix}search in DevTools Elements for ${issue.element}.${sourceLocation}`
  }
  if (issue.rule_id === "image-alt" && issue.text_preview) {
    return `${pagePrefix}search for image filename, src, or label "${issue.text_preview}".${sourceLocation}`
  }
  if (issue.rule_id === "link-name" && issue.text_preview) {
    return `${pagePrefix}search for link text or href "${issue.text_preview}".${sourceLocation}`
  }
  if (issue.dom_path) {
    return `${pagePrefix}inspect the DOM path ending in ${issue.dom_path.split(" > ").at(-1)}.${sourceLocation}`
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
