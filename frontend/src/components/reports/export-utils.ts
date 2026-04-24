/**
 * Report export utilities — CSV generation, PDF via print, and browser print.
 *
 * All exports work entirely client-side using the report data already in memory.
 */

import {
  reportMeta,
  severityBreakdown,
  wcagPrinciples,
  pagesData,
  categoriesData,
  aiSuggestions,
} from "@/components/reports/report-data"

/* ─── CSV ─────────────────────────────────────────────────────────── */

function escapeCSV(value: string | number): string {
  const str = String(value)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildCSV(): string {
  const lines: string[] = []

  // Report metadata
  lines.push("AccessAudit Scan Report")
  lines.push("")
  lines.push(`URL,${escapeCSV(reportMeta.url)}`)
  lines.push(`Date,${escapeCSV(reportMeta.scanDate)}`)
  lines.push(`Scan Mode,${escapeCSV(reportMeta.scanMode)}`)
  lines.push(`Pages Scanned,${reportMeta.pagesScanned}`)
  lines.push(`WCAG Level,${escapeCSV(reportMeta.wcagLevel)}`)
  lines.push(`Accessibility Score,${reportMeta.score}/100`)
  lines.push(`Total Issues,${reportMeta.totalIssues}`)
  lines.push(`Status,${escapeCSV(reportMeta.status)}`)
  lines.push(`Duration,${escapeCSV(reportMeta.scanDuration)}`)
  lines.push("")

  // Severity breakdown
  lines.push("Severity Breakdown")
  lines.push("Severity,Count,Percentage")
  for (const s of severityBreakdown) {
    lines.push(`${s.label},${s.count},${Math.round(s.fraction * 100)}%`)
  }
  lines.push("")

  // WCAG principles
  lines.push("WCAG Principles")
  lines.push("Principle,Issues,Description")
  for (const p of wcagPrinciples) {
    lines.push(`${escapeCSV(p.name)},${p.issues},${escapeCSV(p.desc)}`)
  }
  lines.push("")

  // Pages crawled
  lines.push("Pages Crawled")
  lines.push("URL,Status,Total Issues,Critical,Serious,Moderate,Minor")
  for (const page of pagesData) {
    lines.push(
      `${escapeCSV(page.url)},${page.status},${page.issues},${page.critical},${page.serious},${page.moderate},${page.minor}`
    )
  }
  lines.push("")

  // Page-level issues
  lines.push("Detailed Issues")
  lines.push("Page URL,Issue,Severity,WCAG,Element")
  for (const page of pagesData) {
    for (const el of page.elements) {
      lines.push(
        `${escapeCSV(page.url)},${escapeCSV(el.issue)},${el.severity},${el.wcag},${escapeCSV(el.element)}`
      )
    }
  }
  lines.push("")

  // Categories
  lines.push("Issues by Category")
  lines.push("Category,Total,Critical,Serious,Moderate,Minor")
  for (const cat of categoriesData) {
    lines.push(
      `${escapeCSV(cat.name)},${cat.total},${cat.critical},${cat.serious},${cat.moderate},${cat.minor}`
    )
  }
  lines.push("")

  // AI suggestions
  lines.push("AI Repair Suggestions")
  lines.push("Issue,Severity,WCAG,Pages Affected,Confidence,File,Line")
  for (const s of aiSuggestions) {
    lines.push(
      `${escapeCSV(s.title)},${s.severity},${s.wcag},${s.pages},${s.confidence},${escapeCSV(s.file)},${s.line}`
    )
  }

  return lines.join("\n")
}

export function downloadCSV() {
  const csv = buildCSV()
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = `accessaudit-report-${reportMeta.url.replace(/[^a-z0-9]/gi, "-")}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/* ─── Print / PDF ─────────────────────────────────────────────────── */

export function printReport() {
  window.print()
}

/**
 * PDF export uses the browser print dialog with "Save as PDF" destination.
 * We trigger the same print flow but with a hint in the document title.
 */
export function exportPDF() {
  const originalTitle = document.title
  document.title = `AccessAudit Report — ${reportMeta.url} — ${reportMeta.scanDate}`
  window.print()
  // Restore after a short delay to let the print dialog capture the title
  setTimeout(() => {
    document.title = originalTitle
  }, 1000)
}
