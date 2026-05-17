"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/contexts/AuthContext"
import {
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

  const generatedCount = groups.filter((group) => group.suggestion).length

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between border-b-[0.5px] border-border px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-foreground">AI-Powered Repair Suggestions</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Similar issues are grouped so one AI suggestion can guide multiple fixes.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {generatedCount} of {groups.length || totalCriticalSerious} groups have saved suggestions
          </span>
          <Button variant="outline" size="sm" className="gap-1.5 text-[11px]" disabled>
            Export all patches
          </Button>
        </div>
      </div>

      {error && (
        <div className="m-5 rounded-md border border-red-600/20 bg-[var(--high-bg)] px-4 py-3 text-[13px] text-[var(--high-text)]">
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
        <div className="flex flex-col gap-4 p-5">
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
    <div className="overflow-hidden rounded-md border-[0.5px] border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Badge variant={group.severity} className="text-[10px]">
          {group.severity}
        </Badge>
        <span className="text-xs font-medium text-foreground">{group.title}</span>
        <span className="text-[10px] text-muted-foreground">
          {group.affected_count} instance{group.affected_count === 1 ? "" : "s"} -{" "}
          {group.affected_pages.length} page{group.affected_pages.length === 1 ? "" : "s"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto text-[11px]"
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

      <div className="border-t-[0.5px] border-border px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pattern context
        </div>
        <p className="text-xs leading-relaxed text-foreground/80">
          {group.recommendation}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {group.wcag_criteria.map((criterion) => (
            <Badge key={criterion} variant="outline" className="text-[10px]">
              {criterion}
            </Badge>
          ))}
        </div>
      </div>

      <div className="border-t-[0.5px] border-border bg-muted/30 px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Representative examples
        </div>
        <div className="flex flex-col gap-2">
          {group.examples.slice(0, 3).map((example, index) => (
            <div key={`${group.group_key}-${index}`} className="rounded border border-border bg-card p-2">
              <code className="block break-all font-mono text-[10px] text-foreground">
                {example.element}
              </code>
              {example.page_url && (
                <div className="mt-1 break-all text-[10px] text-muted-foreground">
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
    <div className="border-t-[0.5px] border-border px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            confidenceMap[suggestion.confidence] ?? confidenceMap.medium
          )}
        >
          Confidence: {suggestion.confidence}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {suggestion.provider} - {suggestion.model}
        </span>
      </div>

      <SuggestionSection title="Explanation" body={suggestion.explanation} />
      <SuggestionSection title="Impact" body={suggestion.impact} />
      <SuggestionSection title="Recommended fix" body={suggestion.recommended_fix} />

      {(suggestion.before_code || suggestion.after_code) && (
        <div className="mt-3 overflow-hidden rounded-md border border-border font-mono text-[11px]">
          {suggestion.before_code && (
            <div className="bg-[#FEF2F2] px-3 py-2 text-[var(--high-text)]">
              <span className="mr-2 select-none">-</span>
              {suggestion.before_code}
            </div>
          )}
          {suggestion.after_code && (
            <div className="border-t border-border bg-[#F0FDF4] px-3 py-2 text-accent-foreground">
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
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">{body}</p>
    </div>
  )
}
