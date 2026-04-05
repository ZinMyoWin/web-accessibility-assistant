"use client";

import { useState, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────

type ScanIssue = {
  rule_id: string;
  severity: "high" | "medium" | "low";
  element: string;
  message: string;
  recommendation: string;
  line: number | null;
  column: number | null;
  source_hint: string | null;
  dom_path: string | null;
  text_preview: string | null;
  screenshot_data_url: string | null;
  wcag_criteria: string[] | null;
  source: string | null;
};

type ScanResponse = {
  url: string;
  scanned_at: string;
  summary: {
    total_issues: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: ScanIssue[];
};

// ── Constants ──────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const TEST_URL = `${API}/test/page-bad`;

// ── Style Maps ─────────────────────────────────────────

const sevBadge: Record<string, string> = {
  high: "bg-[var(--high-bg)] text-[var(--high-text)]",
  medium: "bg-[var(--medium-bg)] text-[var(--medium-text)]",
  low: "bg-[var(--low-bg)] text-[var(--low-text)]",
};

const sevBar: Record<string, string> = {
  high: "bg-[var(--high)]",
  medium: "bg-[var(--medium)]",
  low: "bg-[var(--low)]",
};

const sevValue: Record<string, string> = {
  high: "text-[var(--high)]",
  medium: "text-[var(--medium)]",
  low: "text-[var(--low)]",
};

const progressColor: Record<string, string> = {
  idle: "text-muted-foreground",
  active: "text-primary",
  done: "text-accent-foreground font-medium",
  error: "text-destructive",
};

// ── Helpers ────────────────────────────────────────────

function formatRuleId(id: string) {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getBestLocator(issue: ScanIssue): string | null {
  if (issue.rule_id === "heading-order" && issue.text_preview)
    return `Search for heading text "${issue.text_preview}" in the Elements panel.`;
  if (issue.rule_id === "duplicate-id")
    return `Search in DevTools Elements for ${issue.element}.`;
  if (issue.rule_id === "image-alt" && issue.text_preview)
    return `Search for image source or label "${issue.text_preview}".`;
  if (issue.rule_id === "link-name" && issue.text_preview)
    return `Search for link text "${issue.text_preview}".`;
  if (issue.dom_path)
    return `Follow the DOM path ending in ${issue.dom_path.split(" > ").at(-1)}.`;
  return null;
}

// ── Icons (inline SVG) ────────────────────────────────

const iconClass = "w-4 h-4 shrink-0";

const icons = {
  dashboard: (
    <svg className={iconClass} viewBox='0 0 16 16' fill='none'>
      <rect x='1' y='1' width='6' height='6' rx='1' fill='currentColor' />
      <rect x='9' y='1' width='6' height='6' rx='1' fill='currentColor' opacity='.4' />
      <rect x='1' y='9' width='6' height='6' rx='1' fill='currentColor' opacity='.4' />
      <rect x='9' y='9' width='6' height='6' rx='1' fill='currentColor' opacity='.4' />
    </svg>
  ),
  issues: (
    <svg className={iconClass} viewBox='0 0 16 16' fill='none'>
      <path d='M2 4h12M2 8h8M2 12h5' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
  ),
  history: (
    <svg className={iconClass} viewBox='0 0 16 16' fill='none'>
      <circle cx='8' cy='8' r='6' stroke='currentColor' strokeWidth='1.5' />
      <path d='M8 5v3.5l2 2' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
  ),
  reports: (
    <svg className={iconClass} viewBox='0 0 16 16' fill='none'>
      <path d='M3 12V8M6 12V5M9 12V7M12 12V4' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
  ),
  settings: (
    <svg className={iconClass} viewBox='0 0 16 16' fill='none'>
      <circle cx='8' cy='8' r='2.5' stroke='currentColor' strokeWidth='1.5' />
      <path d='M8 1v2M8 13v2M1 8h2M13 8h2' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
  ),
};

// ── Issue Row Component ────────────────────────────────

function IssueRow({ issue }: { issue: ScanIssue }) {
  const [expanded, setExpanded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const locator = getBestLocator(issue);

  return (
    <div
      className={`border-[0.5px] rounded-[var(--radius)] cursor-pointer transition-[border-color,box-shadow] duration-150 overflow-hidden ${
        expanded
          ? "border-primary shadow-[0_0_0_1px_var(--brand-glow)]"
          : "border-border hover:border-[#d1d5db] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Row header */}
      <div className='flex items-start gap-2.5 px-3 py-2.5'>
        <span
          className={`text-[11px] font-medium py-[3px] px-2 rounded-full whitespace-nowrap shrink-0 mt-0.5 uppercase tracking-[0.04em] ${sevBadge[issue.severity]}`}
        >
          {issue.severity}
        </span>
        <div className='flex-1 min-w-0'>
          <div className='text-sm text-foreground leading-relaxed'>
            {issue.message}
          </div>
          <div className='text-[11px] text-muted-foreground mt-0.5'>
            {issue.rule_id}
            {issue.source ? (
              <>
                {" · "}
                <span className='text-[10px] font-medium py-0.5 px-2 rounded-full bg-muted text-[var(--text-secondary)]'>
                  {issue.source === "both" ? "custom + axe-core" : issue.source}
                </span>
              </>
            ) : null}
            {issue.wcag_criteria?.length
              ? ` · ${issue.wcag_criteria.join(", ")}`
              : null}
          </div>
        </div>
        <span
          className={`text-muted-foreground text-[11px] mt-1 shrink-0 transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▸
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className='px-3 pb-3.5 border-t-[0.5px] border-[var(--border-light)]'>
          {issue.wcag_criteria && issue.wcag_criteria.length > 0 && (
            <div className='flex gap-1 flex-wrap mt-2'>
              {issue.wcag_criteria.map((tag) => (
                <span
                  key={tag}
                  className='text-[10px] font-medium py-0.5 px-2 rounded-full bg-[var(--brand-light)] text-accent-foreground border-[0.5px] border-[var(--brand-glow)]'
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {issue.screenshot_data_url && !imgFailed && (
            <div className='my-3 rounded-[var(--radius)] overflow-hidden border-[0.5px] border-border bg-background'>
              <img
                className='block w-full h-auto max-h-[300px] object-contain'
                src={issue.screenshot_data_url}
                alt={`Screenshot for ${issue.rule_id}`}
                onError={() => setImgFailed(true)}
              />
            </div>
          )}
          {issue.screenshot_data_url && imgFailed && (
            <div className='my-3 rounded-[var(--radius)] overflow-hidden border-[0.5px] border-border bg-background p-3.5 text-xs text-muted-foreground'>
              Screenshot unavailable — some sites block automated capture.
            </div>
          )}

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3'>
            <div className='flex flex-col gap-1'>
              <span className='text-xs font-medium text-muted-foreground uppercase tracking-[0.03em]'>
                Element
              </span>
              <code className='font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)] break-all bg-background px-2 py-1 rounded leading-relaxed'>
                {issue.element}
              </code>
            </div>
            {issue.line && (
              <div className='flex flex-col gap-1'>
                <span className='text-xs font-medium text-muted-foreground uppercase tracking-[0.03em]'>
                  Location
                </span>
                <span className='text-xs text-[var(--text-secondary)] leading-relaxed'>
                  Line {issue.line}
                  {issue.column ? `, Col ${issue.column}` : ""}
                </span>
              </div>
            )}
            {issue.source_hint && (
              <div className='flex flex-col gap-1 col-span-full'>
                <span className='text-xs font-medium text-muted-foreground uppercase tracking-[0.03em]'>
                  Source
                </span>
                <code className='font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)] break-all bg-background px-2 py-1 rounded leading-relaxed'>
                  {issue.source_hint}
                </code>
              </div>
            )}
            {issue.dom_path && (
              <div className='flex flex-col gap-1 col-span-full'>
                <span className='text-xs font-medium text-muted-foreground uppercase tracking-[0.03em]'>
                  DOM Path
                </span>
                <code className='font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)] break-all bg-background px-2 py-1 rounded leading-relaxed'>
                  {issue.dom_path}
                </code>
              </div>
            )}
            <div className='flex flex-col gap-1 col-span-full'>
              <span className='text-xs font-medium text-muted-foreground uppercase tracking-[0.03em]'>
                Recommendation
              </span>
              <span className='text-xs text-[var(--text-secondary)] leading-relaxed'>
                {issue.recommendation.includes("More info: ") ? (
                  <>
                    {issue.recommendation.split("More info: ")[0]}
                    <a
                      className='text-primary underline underline-offset-2'
                      href={issue.recommendation.split("More info: ")[1]}
                      target='_blank'
                      rel='noopener noreferrer'
                      onClick={(e) => e.stopPropagation()}
                    >
                      Learn more →
                    </a>
                  </>
                ) : (
                  issue.recommendation
                )}
              </span>
            </div>
          </div>

          {locator && (
            <div className='mt-2.5 px-3 py-2.5 rounded-[var(--radius)] bg-[var(--brand-light)] border-[0.5px] border-[var(--brand-glow)] text-xs text-accent-foreground leading-relaxed'>
              💡 {locator}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────

export default function Dashboard() {
  const [url, setUrl] = useState(TEST_URL);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState(
    "Ready to scan — enter a URL above",
  );
  const [progressState, setProgressState] = useState<
    "idle" | "active" | "done" | "error"
  >("idle");
  const [filter, setFilter] = useState("all");
  const [scanMode, setScanMode] = useState("single");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleScan() {
    if (isScanning || !url.trim()) return;

    setIsScanning(true);
    setError("");
    setResult(null);
    setProgress(0);
    setProgressState("active");
    setProgressText("Connecting to page…");

    let p = 0;
    progressRef.current = setInterval(() => {
      p += Math.random() * 12 + 3;
      if (p > 92) p = 92;
      setProgress(p);
      if (p < 25) setProgressText("Fetching page content…");
      else if (p < 50) setProgressText("Running custom accessibility checks…");
      else if (p < 75) setProgressText("Injecting axe-core engine…");
      else setProgressText("Capturing screenshots…");
    }, 600);

    try {
      const res = await fetch(`${API}/scan/page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { detail?: string };
        throw new Error(body.detail || "Scan request failed.");
      }

      const data = (await res.json()) as ScanResponse;
      setResult(data);
      setProgress(100);
      setProgressText(
        `Scan complete — ${data.summary.total_issues} issue${data.summary.total_issues !== 1 ? "s" : ""} found`,
      );
      setProgressState("done");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unexpected error while scanning.";
      setError(msg);
      setProgress(0);
      setProgressText("Scan failed — check the URL and try again");
      setProgressState("error");
    } finally {
      if (progressRef.current) clearInterval(progressRef.current);
      setIsScanning(false);
    }
  }

  // Derived data
  const counts = result
    ? result.summary
    : { total_issues: 0, high: 0, medium: 0, low: 0 };

  const maxSev = Math.max(counts.high, counts.medium, counts.low, 1);

  const filteredIssues =
    result?.issues.filter((i) => filter === "all" || i.severity === filter) ??
    [];

  const categories = result
    ? Object.entries(
        result.issues.reduce<Record<string, number>>((acc, i) => {
          acc[i.rule_id] = (acc[i.rule_id] || 0) + 1;
          return acc;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
    : [];

  return (
    <>
      {/* Sidebar overlay (mobile) */}
      <div
        className={
          sidebarOpen
            ? "fixed inset-0 bg-black/30 z-[9] md:hidden"
            : "hidden"
        }
        onClick={() => setSidebarOpen(false)}
      />

      <div className='grid grid-cols-1 min-h-screen md:grid-cols-[220px_1fr] md:grid-rows-[auto_1fr]'>
        {/* ── Sidebar ── */}
        <aside
          className={`fixed left-0 top-0 w-60 h-screen overflow-y-auto z-10 flex flex-col bg-card border-r-[0.5px] border-border transition-transform duration-[250ms] ${
            sidebarOpen
              ? "translate-x-0 shadow-[4px_0_24px_rgba(0,0,0,0.12)]"
              : "-translate-x-full shadow-none"
          } md:sticky md:top-0 md:w-auto md:translate-x-0 md:row-span-2 md:shadow-none md:transition-none`}
        >
          <div className='px-5 pt-5 pb-4 border-b-[0.5px] border-border'>
            <div className='text-[15px] font-bold text-primary tracking-tight'>
              AccessAudit
            </div>
            <div className='text-[11px] text-muted-foreground mt-0.5'>
              v1.0 · BSc Project
            </div>
          </div>

          <div className='py-2 flex flex-col'>
            <button className='flex items-center gap-2.5 py-[9px] px-5 text-[13px] cursor-pointer border-none bg-transparent text-left w-full border-l-2 transition-all duration-150 font-[inherit] text-primary bg-[var(--brand-light)] border-l-primary font-medium [&_svg]:opacity-100'>
              {icons.dashboard} Dashboard
            </button>
            <button className='flex items-center gap-2.5 py-[9px] px-5 text-[13px] cursor-pointer border-none bg-transparent text-left w-full border-l-2 border-l-transparent transition-all duration-150 font-[inherit] text-[var(--text-secondary)] hover:text-foreground hover:bg-background [&_svg]:opacity-65'>
              {icons.issues} Issues
            </button>
            <button className='flex items-center gap-2.5 py-[9px] px-5 text-[13px] cursor-pointer border-none bg-transparent text-left w-full border-l-2 border-l-transparent transition-all duration-150 font-[inherit] text-[var(--text-secondary)] hover:text-foreground hover:bg-background [&_svg]:opacity-65'>
              {icons.history} Scan History
            </button>
            <button className='flex items-center gap-2.5 py-[9px] px-5 text-[13px] cursor-pointer border-none bg-transparent text-left w-full border-l-2 border-l-transparent transition-all duration-150 font-[inherit] text-[var(--text-secondary)] hover:text-foreground hover:bg-background [&_svg]:opacity-65'>
              {icons.reports} Reports
            </button>
          </div>

          <div className='text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em] pt-4 px-5 pb-1.5'>
            Settings
          </div>
          <button className='flex items-center gap-2.5 py-[9px] px-5 text-[13px] cursor-pointer border-none bg-transparent text-left w-full border-l-2 border-l-transparent transition-all duration-150 font-[inherit] text-[var(--text-secondary)] hover:text-foreground hover:bg-background [&_svg]:opacity-65'>
            {icons.settings} Preferences
          </button>
        </aside>

        {/* ── Top Bar ── */}
        <header className='px-4 py-2.5 md:px-6 md:py-3 border-b-[0.5px] border-border bg-card flex items-center gap-2.5'>
          <button
            className='flex md:hidden items-center justify-center w-9 h-9 border-[0.5px] border-border bg-transparent cursor-pointer text-base text-[var(--text-secondary)] rounded-[var(--radius)] shrink-0 hover:bg-background'
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label='Toggle sidebar'
          >
            ☰
          </button>
          <input
            className='flex-1 h-9 px-3 border-[0.5px] border-input rounded-[var(--radius)] text-sm font-[inherit] bg-muted text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_2px_rgba(29,158,117,0.2)]'
            type='url'
            placeholder='https://example.com'
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
          />
          <div className='shrink-0 hidden md:block'>
            <Select value={scanMode} onValueChange={setScanMode}>
              <SelectTrigger
                className='min-w-[164px] border-[0.5px] p-1! bg-muted shadow-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/20'
                aria-label='Scan mode'
              >
                <SelectValue placeholder='Select scan mode' />
              </SelectTrigger>
              <SelectContent className='border-[0.5px] p-1!'>
                <SelectItem value='single'>Single page</SelectItem>
                <SelectItem value='multi' disabled>
                  Multi-page (soon)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <button
            className='text-[11px] text-muted-foreground bg-transparent border-none cursor-pointer underline underline-offset-2 font-[inherit] whitespace-nowrap shrink-0 hover:text-primary'
            onClick={() => setUrl(TEST_URL)}
          >
            Use test page
          </button>
          <button
            className='h-9 px-5 inline-flex items-center justify-center bg-primary text-white border-[0.5px] border-primary rounded-[var(--radius)] text-sm font-medium font-[inherit] cursor-pointer whitespace-nowrap transition-[background] duration-150 hover:bg-accent-foreground disabled:opacity-65 disabled:cursor-not-allowed'
            onClick={handleScan}
            disabled={isScanning || !url.trim()}
          >
            {isScanning ? "Scanning…" : "Scan"}
          </button>
        </header>

        {/* ── Content ── */}
        <main className='p-4 md:p-6 overflow-y-auto flex flex-col gap-4'>
          {error && (
            <div className='px-4 py-3 rounded-[var(--radius)] bg-[var(--high-bg)] text-[var(--high-text)] text-[13px] border border-red-600/20'>
              {error}
            </div>
          )}

          {/* Progress */}
          <div className='bg-card border-[0.5px] border-border rounded-[var(--radius-lg)] px-[18px] py-3.5 shadow-[var(--shadow-panel)]'>
            <div className='flex justify-between items-center text-xs text-[var(--text-secondary)] mb-2'>
              <span className={progressColor[progressState]}>
                {progressText}
              </span>
              <span className='font-semibold text-foreground'>
                {Math.round(progress)}%
              </span>
            </div>
            <div className='h-1.5 bg-[var(--border-light)] rounded-[3px] overflow-hidden'>
              <div
                className='h-full bg-gradient-to-r from-primary to-[#5dcaa5] rounded-[3px] transition-[width] duration-[400ms]'
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Metrics */}
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='bg-card border-[0.5px] border-border rounded-[var(--radius-lg)] px-[18px] py-4'>
              <div className='text-xs font-medium text-muted-foreground tracking-[0.03em] uppercase'>
                Total Issues
              </div>
              <div className='text-[22px] font-medium text-primary mt-1 leading-tight'>
                {counts.total_issues}
              </div>
              <div className='text-[11px] text-muted-foreground mt-1'>
                across all checks
              </div>
            </div>
            {(["high", "medium", "low"] as const).map((sev) => (
              <div
                key={sev}
                className='bg-card border-[0.5px] border-border rounded-[var(--radius-lg)] px-[18px] py-4'
              >
                <div className='text-xs font-medium text-muted-foreground tracking-[0.03em] uppercase'>
                  {sev.charAt(0).toUpperCase() + sev.slice(1)}
                </div>
                <div
                  className={`text-[22px] font-medium mt-1 leading-tight ${sevValue[sev]}`}
                >
                  {counts[sev]}
                </div>
                <div className='text-[11px] text-muted-foreground mt-1'>
                  {sev === "high"
                    ? "fix immediately"
                    : sev === "medium"
                      ? "should address"
                      : "minor concerns"}
                </div>
              </div>
            ))}
          </div>

          {/* Two-Column: Breakdown + Info */}
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            {/* Severity Breakdown */}
            <div className='bg-card border-[0.5px] border-border rounded-[var(--radius-lg)] px-5 py-[18px] shadow-[var(--shadow-panel)]'>
              <div className='flex flex-col gap-2.5 items-start mb-3.5 sm:flex-row sm:justify-between sm:items-center'>
                <span className='text-[15px] font-medium text-foreground'>
                  Severity Breakdown
                </span>
                <span className='text-xs text-muted-foreground'>
                  {counts.total_issues} issue
                  {counts.total_issues !== 1 ? "s" : ""}
                </span>
              </div>
              {(["high", "medium", "low"] as const).map((sev) => (
                <div key={sev} className='flex items-center gap-2.5 mb-2.5 last:mb-0'>
                  <span className='text-xs text-[var(--text-secondary)] w-[60px] capitalize'>
                    {sev}
                  </span>
                  <div className='flex-1 h-2 bg-[var(--border-light)] rounded overflow-hidden'>
                    <div
                      className={`h-full rounded transition-[width] duration-500 ${sevBar[sev]}`}
                      style={{
                        width: `${(counts[sev] / maxSev) * 100}%`,
                      }}
                    />
                  </div>
                  <span className='text-xs font-semibold w-7 text-right text-foreground'>
                    {counts[sev]}
                  </span>
                </div>
              ))}

              <div className='mt-4 pt-3.5 border-t-[0.5px] border-border'>
                <div className='text-xs font-medium text-muted-foreground uppercase tracking-[0.03em] mb-2'>
                  Top Rules
                </div>
                {categories.length > 0 ? (
                  categories.map(([name, count]) => (
                    <div
                      key={name}
                      className='flex justify-between items-center py-1 text-xs text-[var(--text-secondary)]'
                    >
                      <span>{formatRuleId(name)}</span>
                      <span className='font-semibold text-foreground'>
                        {count}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className='text-xs text-muted-foreground py-2'>—</span>
                )}
              </div>
            </div>

            {/* Scan Details */}
            <div className='bg-card border-[0.5px] border-border rounded-[var(--radius-lg)] px-5 py-[18px] shadow-[var(--shadow-panel)]'>
              <div className='flex flex-col gap-2.5 items-start mb-3.5 sm:flex-row sm:justify-between sm:items-center'>
                <span className='text-[15px] font-medium text-foreground'>
                  Scan Details
                </span>
              </div>
              {result ? (
                <>
                  {[
                    ["URL", result.url],
                    [
                      "Scanned at",
                      new Date(result.scanned_at).toLocaleString(),
                    ],
                    ["Total issues", String(result.summary.total_issues)],
                    ["High", String(result.summary.high)],
                    ["Medium", String(result.summary.medium)],
                    ["Low", String(result.summary.low)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='flex justify-between py-2.5 border-b-[0.5px] border-[var(--border-light)] text-xs last:border-b-0'
                    >
                      <span className='text-muted-foreground shrink-0'>
                        {label}
                      </span>
                      <span className='text-foreground font-medium text-right max-w-[65%] overflow-hidden text-ellipsis whitespace-nowrap'>
                        {value}
                      </span>
                    </div>
                  ))}
                  <div className='flex justify-between py-2.5 text-xs'>
                    <span className='text-muted-foreground shrink-0'>
                      Endpoint
                    </span>
                    <span className='text-foreground font-medium text-right max-w-[65%] overflow-hidden text-ellipsis whitespace-nowrap'>
                      <code className='text-[11px] bg-background px-1.5 py-0.5 rounded font-[var(--font-mono)]'>
                        {API}/scan/page
                      </code>
                    </span>
                  </div>
                </>
              ) : (
                <div className='text-xs text-muted-foreground py-2'>
                  No scan results yet. Enter a URL and click Scan.
                </div>
              )}
            </div>
          </div>

          {/* Issues Panel */}
          <div className='bg-card border-[0.5px] border-border rounded-[var(--radius-lg)] px-5 py-[18px] shadow-[var(--shadow-panel)]'>
            <div className='flex flex-col gap-2.5 items-start mb-3.5 sm:flex-row sm:justify-between sm:items-center'>
              <span className='text-[15px] font-medium text-foreground'>
                Issues Found
              </span>
              <div className='flex gap-1.5 flex-wrap'>
                {(["all", "high", "medium", "low"] as const).map((f) => (
                  <button
                    key={f}
                    className={`py-1 px-3 text-[11px] font-medium font-[inherit] rounded-full border-[0.5px] cursor-pointer transition-all duration-150 ${
                      filter === f
                        ? "bg-primary border-primary text-white"
                        : "bg-transparent border-border text-[var(--text-secondary)] hover:border-muted-foreground"
                    }`}
                    onClick={() => setFilter(f)}
                  >
                    {f === "all"
                      ? "All"
                      : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className='flex flex-col gap-1.5'>
              {!result ? (
                <div className='text-xs text-muted-foreground py-2'>
                  Run a scan to see issues.
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className='text-xs text-muted-foreground py-2'>
                  No issues at this severity level.
                </div>
              ) : (
                filteredIssues.map((issue, i) => (
                  <IssueRow
                    key={`${issue.rule_id}-${issue.element}-${i}`}
                    issue={issue}
                  />
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
