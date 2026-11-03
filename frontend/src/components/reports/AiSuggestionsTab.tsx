"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/contexts/AuthContext"
import { downloadTextFile } from "@/lib/download"
import {
  fetchRepairSuggestionBundle,
  fetchRepairSuggestionGroups,
  generateRepairSuggestionGroup,
  type RepairSuggestion,
  type RepairSuggestionGroup,
} from "@/lib/saved-scans"
import { cn } from "@/lib/utils"

const confidenceMap: Record<string, string> = {
  high: "text-accent-foreground bg-secondary",
  medium: "text-[var(--medium-text)] bg-[var(--medium-bg)]",
  low: "text-muted-foreground bg-muted",
}

export function AiSuggestionsTab({
  scanId,
  totalCriticalSerious,
}: {
  scanId: string | null
  totalCriticalSerious: number
}) {
  const { token } = useAuth()
  const [groups, setGroups] = useState<RepairSuggestionGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [generatingKey, setGeneratingKey] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [exportStatus, setExportStatus] = useState("")

  useEffect(() => {
    if (!scanId || !token) {
      setGroups([])
      return
    }

    const authToken = token
    const currentScanId = scanId
    let cancelled = false

    async function loadGroups() {
      setLoading(true)
      setError("")
      try {
        const response = await fetchRepairSuggestionGroups(currentScanId, authToken)
        if (!cancelled) {
          setGroups(response.groups)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load repair suggestion groups."
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadGroups()

    return () => {
      cancelled = true
    }
  }, [scanId, token])

  async function handleGenerate(groupKey: string, force = false) {
    if (!scanId || !token || generatingKey) {
      return
    }

    setGeneratingKey(groupKey)
    setError("")
    try {
      const suggestion = await generateRepairSuggestionGroup(scanId, groupKey, token, { force })
      setGroups((currentGroups) =>
        currentGroups.map((group) =>
          group.group_key === groupKey ? { ...group, suggestion } : group
        )
      )
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Failed to generate repair suggestion."
      )
    } finally {
      setGeneratingKey(null)
    }
  }

  async function handleExportBundle() {
    if (!scanId || !token || exporting || groups.length === 0) {
      return
    }

    setExporting(true)
    setExportError("")
    setExportStatus("")
    try {
      const bundle = await fetchRepairSuggestionBundle(scanId, token, "markdown")
      const filename =
        bundle.filename || `accessaudit-patch-bundle-${scanId}.md`
      downloadTextFile(
        filename,
        bundle.content,
        bundle.content_type || "text/markdown;charset=utf-8"
      )
      setExportStatus(
        `Downloaded ${filename} - ${bundle.generated_count} of ${bundle.group_count} groups have suggestions` +
          (bundle.missing_count > 0
            ? `, ${bundle.missing_count} still missing.`
            : ".")
      )
    } catch (exportFailure) {
      setExportError(
        exportFailure instanceof Error
          ? exportFailure.message
          : "Failed to export repair suggestions."
      )
    } finally {
      setExporting(false)
    }
  }

  const generatedCount = groups.filter((group) => group.suggestion).length
  const canExport = Boolean(scanId) && groups.length > 0 && !loading

  return (
    <div className="flex min-w-0 flex-col gap-0">
      <div className="flex flex-col justify-between gap-4 border-b border-border p-5 sm:p-6 xl:flex-row xl:items-center">
        <div>
          <div className="text-base font-semibold text-foreground">AI-Powered Repair Suggestions</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Similar issues are grouped so one AI suggestion can guide multiple fixes.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {generatedCount} of {groups.length || totalCriticalSerious} groups have saved suggestions
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!canExport || exporting}
            onClick={() => void handleExportBundle()}
          >
            {exporting ? "Preparing bundle..." : "Export all patches"}
          </Button>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          data-testid="ai-export-error"
          className="mx-5 mt-4 rounded-[10px] border border-severity-critical/20 bg-severity-critical-bg px-4 py-3 text-[13px] text-severity-critical-text"
        >
          {exportError}
        </div>
      )}

      {exportStatus && (
        <div
          role="status"
          data-testid="ai-export-status"
          className="mx-5 mt-4 rounded-[10px] border border-border bg-muted px-4 py-3 text-[13px] text-muted-foreground"
        >
          {exportStatus}
        </div>
      )}

      {error && (
        <div role="alert" className="m-5 rounded-[10px] border border-red-600/20 bg-[var(--high-bg)] px-4 py-3 text-[13px] text-[var(--high-text)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-5 text-xs text-muted-foreground">
          Loading repair suggestion groups...
        </div>
      ) : groups.length === 0 ? (
        <div className="p-5 text-xs text-muted-foreground">
          No grouped accessibility issues are available for AI repair suggestions.
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          {groups.map((group) => (
            <SuggestionGroupCard
              key={group.group_key}
              group={group}
              generating={generatingKey === group.group_key}
              onGenerate={() => handleGenerate(group.group_key, Boolean(group.suggestion))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SuggestionGroupCard({
  group,
  generating,
  onGenerate,
}: {
  group: RepairSuggestionGroup
  generating: boolean
  onGenerate: () => void
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Badge variant={group.severity} className="text-xs">
          {group.severity}
        </Badge>
        <span className="text-sm font-semibold text-foreground">{group.title}</span>
        <span className="text-xs text-muted-foreground">
          {group.affected_count} instance{group.affected_count === 1 ? "" : "s"} -{" "}
          {group.affected_pages.length} page{group.affected_pages.length === 1 ? "" : "s"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto text-xs"
          disabled={generating}
          onClick={onGenerate}
        >
          {generating
            ? "Generating..."
            : group.suggestion
              ? "Regenerate suggestion"
              : "Generate suggestion"}
        </Button>
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="mb-2 text-sm font-semibold text-foreground">
          Pattern context
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          {group.recommendation}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {group.wcag_criteria.map((criterion) => (
            <Badge key={criterion} variant="outline" className="text-xs">
              {criterion}
            </Badge>
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-background px-5 py-4">
        <div className="mb-2 text-sm font-semibold text-foreground">
          Representative examples
        </div>
        <div className="flex flex-col gap-2">
          {group.examples.slice(0, 3).map((example, index) => (
            <div key={`${group.group_key}-${index}`} className="rounded-[10px] border border-border bg-card p-3">
              <code className="block break-all font-mono text-[13px] text-foreground">
                {example.element}
              </code>
              {example.page_url && (
                <div className="mt-1 break-all text-xs text-muted-foreground">
                  {example.page_url}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {group.suggestion && <SuggestionBody suggestion={group.suggestion} />}
    </div>
  )
}

function SuggestionBody({ suggestion }: { suggestion: RepairSuggestion }) {
  return (
    <div className="border-t border-border px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            confidenceMap[suggestion.confidence] ?? confidenceMap.medium
          )}
        >
          Confidence: {suggestion.confidence}
        </span>
        <span className="text-xs text-muted-foreground">
          {suggestion.provider} - {suggestion.model}
        </span>
      </div>

      <SuggestionSection title="Explanation" body={suggestion.explanation} />
      <SuggestionSection title="Impact" body={suggestion.impact} />
      <SuggestionSection title="Recommended fix" body={suggestion.recommended_fix} />

      {(suggestion.before_code || suggestion.after_code) && (
        <div className="mt-3 overflow-hidden rounded-[10px] border border-border whitespace-pre-wrap break-words font-mono text-[13px]">
          {suggestion.before_code && (
            <div className="bg-[var(--high-bg)] px-3 py-2 text-[var(--high-text)]">
              <span className="mr-2 select-none">-</span>
              {suggestion.before_code}
            </div>
          )}
          {suggestion.after_code && (
            <div className="border-t border-border bg-[var(--low-bg)] px-3 py-2 text-accent-foreground">
              <span className="mr-2 select-none">+</span>
              {suggestion.after_code}
            </div>
          )}
        </div>
      )}

      {suggestion.limitations && (
        <SuggestionSection title="Limitations" body={suggestion.limitations} />
      )}
    </div>
  )
}

function SuggestionSection({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1 text-sm font-semibold text-foreground">
        {title}
      </div>
      <p className="text-sm leading-relaxed text-foreground">{body}</p>
    </div>
  )
}
