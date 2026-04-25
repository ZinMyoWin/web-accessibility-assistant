"use client"

import { Button } from "@/components/ui/button"
import { downloadCSV, printReport, exportPDF } from "@/components/reports/export-utils"
import type { ReportViewData } from "@/lib/saved-scans"

interface ExportBarProps {
  report: ReportViewData
  onToast?: (msg: string) => void
}

export function ExportBar({ report, onToast }: ExportBarProps) {
  const actions = [
    {
      label: "Print",
      icon: <path d="M4 6V2h8v4M2 6h12v5H2zM4 13h8v3H4z" />,
      onClick: () => printReport(),
    },
    {
      label: "CSV",
      icon: <path d="M3 8h10M3 5h4M3 11h7" strokeLinecap="round" />,
      onClick: () => {
        downloadCSV(report)
        onToast?.("CSV report downloaded")
      },
    },
    {
      label: "PDF",
      icon: <path d="M4 1h5l4 4v10H4V1zM9 1v4h4" />,
      onClick: () => exportPDF(report),
    },
  ]

  return (
    <div className="flex items-center gap-2 bg-foreground px-5 py-3 print:hidden">
      <span className="flex-1 text-[11px] text-muted-foreground/75">
        Export report
      </span>
      {actions.map(({ label, icon, onClick }) => (
        <Button
          key={label}
          variant="outline"
          size="sm"
          className="gap-1.5 border-muted-foreground/30 bg-transparent text-[11px] text-muted-foreground/90 hover:bg-muted-foreground/10 hover:text-white"
          onClick={onClick}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
            {icon}
          </svg>
          {label}
        </Button>
      ))}
    </div>
  )
}
