import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import type { ReportMeta } from "@/lib/saved-scans"

export function ReportHeader({ reportMeta }: { reportMeta: ReportMeta }) {
  return (
    <div className="px-6 py-5">
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        {reportMeta.breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="size-2.5">
                <path d="M6 4l4 4-4 4" strokeLinecap="round" />
              </svg>
            )}
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          </span>
        ))}
      </div>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {reportMeta.url}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="size-3">
                <rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M2 6h12" /><circle cx="5" cy="4" r=".5" fill="currentColor" />
              </svg>
              {reportMeta.scanDate}
            </span>
            <span>|</span>
            <span>{reportMeta.scanMode}</span>
            <span>|</span>
            <span>{reportMeta.pagesScanned} pages</span>
            <span>|</span>
            <span>{reportMeta.totalIssues} issues</span>
            <span>|</span>
            <span>{reportMeta.wcagLevel}</span>
            <span>|</span>
            <span>Duration: {reportMeta.scanDuration}</span>
          </div>
        </div>
        <Badge variant="serious" className="shrink-0">
          {reportMeta.status}
        </Badge>
      </div>
    </div>
  )
}
