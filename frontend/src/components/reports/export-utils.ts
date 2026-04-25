import type { ReportViewData } from "@/lib/saved-scans"

function escapeCSV(value: string | number): string {
  const str = String(value)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildCSV(report: ReportViewData): string {
  const lines: string[] = []
  const { meta, severityBreakdown, wcagPrinciples, pagesData, categoriesData, aiSuggestions } = report

  lines.push("AccessAudit Scan Report")
  lines.push("")
  lines.push(`URL,${escapeCSV(meta.url)}`)
  lines.push(`Date,${escapeCSV(meta.scanDate)}`)
  lines.push(`Scan Mode,${escapeCSV(meta.scanMode)}`)
  lines.push(`Pages Scanned,${meta.pagesScanned}`)
  lines.push(`WCAG Level,${escapeCSV(meta.wcagLevel)}`)
  lines.push(`Accessibility Score,${meta.score == null ? "N/A" : `${meta.score}/100`}`)
  lines.push(`Total Issues,${meta.totalIssues}`)
  lines.push(`Status,${escapeCSV(meta.status)}`)
  lines.push(`Duration,${escapeCSV(meta.scanDuration)}`)
  lines.push("")

  lines.push("Severity Breakdown")
  lines.push("Severity,Count,Percentage")
  for (const s of severityBreakdown) {
    lines.push(`${s.label},${s.count},${Math.round(s.fraction * 100)}%`)
  }
  lines.push("")

  lines.push("WCAG Principles")
  lines.push("Principle,Issues,Description")
  for (const p of wcagPrinciples) {
    lines.push(`${escapeCSV(p.name)},${p.issues},${escapeCSV(p.desc)}`)
  }
  lines.push("")

  lines.push("Pages Crawled")
  lines.push("URL,Status,Total Issues,Critical,Serious,Moderate,Minor")
  for (const page of pagesData) {
    lines.push(
      `${escapeCSV(page.url)},${page.status},${page.issues},${page.critical},${page.serious},${page.moderate},${page.minor}`
    )
  }
  lines.push("")

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

  lines.push("Issues by Category")
  lines.push("Category,Total,Critical,Serious,Moderate,Minor")
  for (const cat of categoriesData) {
    lines.push(
      `${escapeCSV(cat.name)},${cat.total},${cat.critical},${cat.serious},${cat.moderate},${cat.minor}`
    )
  }
  lines.push("")

  lines.push("AI Repair Suggestions")
  lines.push("Issue,Severity,WCAG,Pages Affected,Confidence,File,Line")
  for (const s of aiSuggestions) {
    lines.push(
      `${escapeCSV(s.title)},${s.severity},${s.wcag},${s.pages},${s.confidence},${escapeCSV(s.file)},${s.line}`
    )
  }

  return lines.join("\n")
}

export function downloadCSV(report: ReportViewData) {
  const csv = buildCSV(report)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = `accessaudit-report-${report.meta.url.replace(/[^a-z0-9]/gi, "-")}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function printReport() {
  window.print()
}

export function exportPDF(report: ReportViewData) {
  const originalTitle = document.title
  document.title = `AccessAudit Report - ${report.meta.url} - ${report.meta.scanDate}`
  window.print()
  setTimeout(() => {
    document.title = originalTitle
  }, 1000)
}
