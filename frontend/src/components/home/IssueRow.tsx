"use client"

import { useState } from "react"
import { getBestLocator } from "@/components/home/utils"
import { severityBadgeClass } from "@/components/home/constants"
import type { ScanIssue } from "@/components/home/types"

type IssueRowProps = {
  issue: ScanIssue
}

export function IssueRow({ issue }: IssueRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)

  const locator = getBestLocator(issue)

  return (
    <div
      className={`overflow-hidden rounded-[var(--radius)] border-[0.5px] transition-[border-color,box-shadow] duration-150 ${
        expanded
          ? "border-primary shadow-[0_0_0_1px_var(--brand-glow)]"
          : "border-border hover:border-[#d1d5db] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      }`}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-medium uppercase tracking-[0.04em] ${severityBadgeClass[issue.severity]}`}
        >
          {issue.severity}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-relaxed text-foreground">
            {issue.message}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {issue.rule_id}
            {issue.source ? (
              <>
                {" · "}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
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
          className={`mt-1 shrink-0 text-[11px] text-muted-foreground transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        >
          ▸
        </span>
      </button>

      {expanded && (
        <div className="border-t-[0.5px] border-[var(--border-light)] px-3 pb-3.5">
          {issue.wcag_criteria && issue.wcag_criteria.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {issue.wcag_criteria.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border-[0.5px] border-[var(--brand-glow)] bg-[var(--brand-light)] px-2 py-0.5 text-[10px] font-medium text-accent-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {issue.screenshot_data_url && !imageFailed && (
            <div className="my-3 overflow-hidden rounded-[var(--radius)] border-[0.5px] border-border bg-background">
              <img
                className="block max-h-[300px] w-full object-contain"
                src={issue.screenshot_data_url}
                alt={`Screenshot for ${issue.rule_id}`}
                onError={() => setImageFailed(true)}
              />
            </div>
          )}

          {issue.screenshot_data_url && imageFailed && (
            <div className="my-3 rounded-[var(--radius)] border-[0.5px] border-border bg-background p-3.5 text-xs text-muted-foreground">
              Screenshot unavailable - some sites block automated capture.
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground">
                Element
              </span>
              <code className="break-all rounded bg-background px-2 py-1 font-[var(--font-mono)] text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {issue.element}
              </code>
            </div>

            {issue.line && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground">
                  Location
                </span>
                <span className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  Line {issue.line}
                  {issue.column ? `, Col ${issue.column}` : ""}
                </span>
              </div>
            )}

            {issue.source_hint && (
              <div className="col-span-full flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground">
                  Source
                </span>
                <code className="break-all rounded bg-background px-2 py-1 font-[var(--font-mono)] text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {issue.source_hint}
                </code>
              </div>
            )}

            {issue.dom_path && (
              <div className="col-span-full flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground">
                  DOM Path
                </span>
                <code className="break-all rounded bg-background px-2 py-1 font-[var(--font-mono)] text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {issue.dom_path}
                </code>
              </div>
            )}

            <div className="col-span-full flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground">
                Recommendation
              </span>
              <span className="text-xs leading-relaxed text-[var(--text-secondary)]">
                {issue.recommendation.includes("More info: ") ? (
                  <>
                    {issue.recommendation.split("More info: ")[0]}
                    <a
                      className="text-primary underline underline-offset-2"
                      href={issue.recommendation.split("More info: ")[1]}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Learn more
                    </a>
                  </>
                ) : (
                  issue.recommendation
                )}
              </span>
            </div>
          </div>

          {locator && (
            <div className="mt-2.5 rounded-[var(--radius)] border-[0.5px] border-[var(--brand-glow)] bg-[var(--brand-light)] px-3 py-2.5 text-xs leading-relaxed text-accent-foreground">
              Tip: {locator}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
