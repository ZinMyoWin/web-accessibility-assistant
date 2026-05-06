import { Button } from "@/components/ui/button"
import type { SavedScanDetail } from "@/lib/saved-scans"

type QueuePanelProps = {
  activeScan: SavedScanDetail | null
  queueActionUrl: string | null
  onRemovePage: (pageUrl: string) => void
  onPrioritizePage: (pageUrl: string) => void
}

export function QueuePanel({
  activeScan,
  queueActionUrl,
  onRemovePage,
  onPrioritizePage,
}: QueuePanelProps) {
  if (!activeScan || activeScan.mode !== "multi") {
    return null
  }

  const isMutable = activeScan.status === "queued" || activeScan.status === "running"
  const queuedPages = activeScan.queued_page_urls
  const excludedPages = activeScan.excluded_page_urls

  return (
    <section className="rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card px-5 py-4 shadow-[var(--shadow-panel)]">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-foreground">Scan queue</h2>
          <p className="text-xs text-muted-foreground">
            Review discovered pages before the worker scans them.
          </p>
        </div>
        <div className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Attempt {activeScan.worker_attempts}/{activeScan.max_worker_attempts}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-md border-[0.5px] border-border bg-muted/30 p-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Currently scanning
          </div>
          {activeScan.current_page_url ? (
            <code className="block truncate rounded bg-background px-2 py-2 font-[var(--font-mono)] text-[11px] text-foreground">
              {activeScan.current_page_url}
            </code>
          ) : (
            <div className="rounded bg-background px-2 py-2 text-xs text-muted-foreground">
              {activeScan.status === "queued"
                ? "Waiting for the scan worker to claim this job."
                : "Preparing the next page."}
            </div>
          )}
          {activeScan.last_error && (
            <p className="mt-2 text-[11px] text-[var(--high-text)]">
              Last worker note: {activeScan.last_error}
            </p>
          )}
        </div>

        <div className="rounded-md border-[0.5px] border-border">
          <div className="flex items-center justify-between border-b-[0.5px] border-border px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Queued pages
            </span>
            <span className="text-[11px] text-muted-foreground">
              {queuedPages.length} waiting
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {queuedPages.length > 0 ? (
              queuedPages.map((pageUrl, index) => {
                const isBusy = queueActionUrl === pageUrl
                return (
                  <div
                    key={pageUrl}
                    className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-b-[0.5px] border-border px-3 py-2 last:border-b-0"
                  >
                    <span className="text-xs font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <code className="truncate font-[var(--font-mono)] text-[11px] text-foreground">
                      {pageUrl}
                    </code>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={!isMutable || isBusy || index === 0}
                        onClick={() => onPrioritizePage(pageUrl)}
                      >
                        First
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-[11px] text-[var(--high-text)]"
                        disabled={!isMutable || isBusy}
                        onClick={() => onRemovePage(pageUrl)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                No queued pages yet. The queue appears after the start page is scanned.
              </div>
            )}
          </div>
        </div>
      </div>

      {excludedPages.length > 0 && (
        <div className="mt-3 rounded-md border-[0.5px] border-border bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Removed from this scan
          </div>
          <div className="flex max-h-20 flex-col gap-1 overflow-y-auto">
            {excludedPages.map((pageUrl) => (
              <code
                key={pageUrl}
                className="truncate font-[var(--font-mono)] text-[11px] text-muted-foreground"
              >
                {pageUrl}
              </code>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
