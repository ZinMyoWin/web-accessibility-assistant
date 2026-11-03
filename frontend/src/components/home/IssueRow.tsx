"use client"

import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import { getBestLocator } from "@/components/home/utils"
import { severityBadgeClass } from "@/components/home/constants"
import type { ScanIssue } from "@/components/home/types"

type IssueRowProps = {
  issue: ScanIssue
}

export function IssueRow({ issue }: IssueRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const detailId = useId()

  const locator = getBestLocator(issue)

  return (
    <div
      className={`overflow-hidden rounded-xl border transition-colors duration-150 ${
        expanded
          ? "border-primary/40 bg-brand-50/30"
          : "border-border hover:border-brand-300"
      }`}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          className={`mt-0.5 shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${severityBadgeClass[issue.severity]}`}
        >
          {issue.severity}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-relaxed text-foreground sm:text-[15px]">
            {issue.message}
          </div>
          <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {issue.rule_id}
            {issue.source ? (
              <>
                {" · "}
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {issue.source === "both" ? "custom + axe-core" : issue.source}
                </span>
              </>
            ) : null}
            {issue.wcag_criteria?.length
              ? ` · ${issue.wcag_criteria.join(", ")}`
              : null}
          </div>
        </div>
        <ChevronDown className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {expanded && (
        <div id={detailId} className="border-t border-border px-4 pb-5 sm:px-5">
          {issue.wcag_criteria && issue.wcag_criteria.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {issue.wcag_criteria.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-primary/20 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
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
              <span className="text-sm font-medium text-muted-foreground">
                Element
              </span>
              <code className="break-all rounded bg-background px-2 py-1 font-mono text-xs leading-relaxed text-muted-foreground">
                {issue.element}
              </code>
            </div>

            {issue.line && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Location
                </span>
                <span className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  Line {issue.line}
                  {issue.column ? `, Col ${issue.column}` : ""}
                </span>
              </div>
            )}

            {issue.page_url && (
              <div className="col-span-full flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Affected page
                </span>
                <a
                  className="break-all text-xs leading-relaxed text-primary underline underline-offset-2"
                  href={issue.page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {issue.page_url}
                </a>
              </div>
            )}

            {issue.source_hint && (
              <div className="col-span-full flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Source
                </span>
                <code className="break-all rounded bg-background px-2 py-1 font-mono text-xs leading-relaxed text-muted-foreground">
                  {issue.source_hint}
                </code>
              </div>
            )}

            {issue.dom_path && (
              <div className="col-span-full flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">
                  DOM Path
                </span>
                <code className="break-all rounded bg-background px-2 py-1 font-mono text-xs leading-relaxed text-muted-foreground">
                  {issue.dom_path}
                </code>
              </div>
            )}

            <div className="col-span-full flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                Recommendation
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">
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
