export type ScanStatus = "complete" | "running" | "error"
export type ScanMode = "single" | "multi"

export interface Scan {
  id: string
  url: string
  status: ScanStatus
  mode: ScanMode
  pageLimit?: number
  pagesScanned: number
  duration?: number
  startedAt: string
  issues: {
    critical: number
    serious: number
    moderate: number
    minor: number
  }
  score?: number
  errorMessage?: string
}

export const MOCK_SCANS: Scan[] = [
  {
    id: "scan-1",
    url: "gov.uk",
    status: "running",
    mode: "multi",
    pageLimit: 20,
    pagesScanned: 8,
    startedAt: "2026-04-07T09:30:00Z",
    issues: { critical: 0, serious: 0, moderate: 0, minor: 0 },
  },
  {
    id: "scan-2",
    url: "bbc.co.uk",
    status: "complete",
    mode: "multi",
    pagesScanned: 15,
    duration: 202,
    startedAt: "2026-04-07T09:14:00Z",
    issues: { critical: 12, serious: 8, moderate: 19, minor: 5 },
    score: 68,
  },
  {
    id: "scan-3",
    url: "roehampton.ac.uk/courses",
    status: "complete",
    mode: "single",
    pagesScanned: 1,
    duration: 69,
    startedAt: "2026-04-06T16:42:00Z",
    issues: { critical: 4, serious: 11, moderate: 7, minor: 2 },
    score: 72,
  },
  {
    id: "scan-4",
    url: "nhs.uk",
    status: "complete",
    mode: "multi",
    pagesScanned: 20,
    duration: 341,
    startedAt: "2026-04-06T11:22:00Z",
    issues: { critical: 2, serious: 6, moderate: 14, minor: 9 },
    score: 84,
  },
  {
    id: "scan-5",
    url: "example-protected.com",
    status: "error",
    mode: "single",
    pagesScanned: 0,
    startedAt: "2026-04-05T14:08:00Z",
    issues: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    errorMessage: "connection timeout",
  },
  {
    id: "scan-6",
    url: "roehampton.ac.uk",
    status: "complete",
    mode: "multi",
    pagesScanned: 18,
    duration: 252,
    startedAt: "2026-04-04T10:55:00Z",
    issues: { critical: 6, serious: 14, moderate: 9, minor: 3 },
    score: 71,
  },
  {
    id: "scan-7",
    url: "bbc.co.uk",
    status: "complete",
    mode: "multi",
    pagesScanned: 15,
    duration: 185,
    startedAt: "2026-04-03T09:00:00Z",
    issues: { critical: 15, serious: 9, moderate: 21, minor: 7 },
    score: 61,
  },
  {
    id: "scan-8",
    url: "nhs.uk/conditions",
    status: "complete",
    mode: "single",
    pagesScanned: 1,
    duration: 168,
    startedAt: "2026-04-01T15:33:00Z",
    issues: { critical: 1, serious: 3, moderate: 5, minor: 1 },
    score: 91,
  },
]
