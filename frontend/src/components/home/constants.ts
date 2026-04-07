import type { IssueSeverity, ProgressState, ScanSummary } from "@/components/home/types"

export const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"

export const TEST_URL = `${API}/test/page-bad`

export const EMPTY_SUMMARY: ScanSummary = {
  total_issues: 0,
  high: 0,
  medium: 0,
  low: 0,
}

export const severityBadgeClass: Record<IssueSeverity, string> = {
  high: "bg-[var(--high-bg)] text-[var(--high-text)]",
  medium: "bg-[var(--medium-bg)] text-[var(--medium-text)]",
  low: "bg-[var(--low-bg)] text-[var(--low-text)]",
}

export const severityBarClass: Record<IssueSeverity, string> = {
  high: "bg-[var(--high)]",
  medium: "bg-[var(--medium)]",
  low: "bg-[var(--low)]",
}

export const severityValueClass: Record<IssueSeverity, string> = {
  high: "text-[var(--high)]",
  medium: "text-[var(--medium)]",
  low: "text-[var(--low)]",
}

export const progressStateClass: Record<ProgressState, string> = {
  idle: "text-muted-foreground",
  active: "text-primary",
  done: "text-accent-foreground font-medium",
  error: "text-destructive",
}

export const severityFilters = ["all", "high", "medium", "low"] as const
