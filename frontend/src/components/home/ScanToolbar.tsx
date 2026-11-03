"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Globe2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ScanToolbarProps = {
  url: string
  scanMode: "single" | "multi"
  isScanning: boolean
  canCancel?: boolean
  isCancelling?: boolean
  onUrlChange: (value: string) => void
  onScanModeChange: (value: "single" | "multi") => void
  onScan: () => void
  onCancel?: () => void
}

export function ScanToolbar({
  url,
  scanMode,
  isScanning,
  canCancel = false,
  isCancelling = false,
  onUrlChange,
  onScanModeChange,
  onScan,
  onCancel,
}: ScanToolbarProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => {
    if (!canCancel) {
      setConfirmingCancel(false)
    }
  }, [canCancel])

  return (
    <section aria-labelledby="new-scan-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary"><Globe2 className="size-5" aria-hidden="true" /></span>
        <div><h2 id="new-scan-heading" className="text-lg font-semibold tracking-tight">Start an accessibility scan</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Enter a website URL to find barriers and get practical guidance.</p></div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
      <label htmlFor="scan-website-url" className="mb-2 block text-sm font-medium">Website URL</label>
      <input
        id="scan-website-url"
        className="h-12 w-full min-w-0 rounded-lg border border-input bg-background/60 px-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        type="url"
        placeholder="https://example.com"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onScan()}
      />
      </div>
      <div className="min-w-0 flex-1 sm:max-w-[210px]">
        <span className="mb-2 block text-sm font-medium" aria-hidden="true">Scan mode</span>
        <Select value={scanMode} onValueChange={onScanModeChange}>
          <SelectTrigger
            className="h-12 w-full border-input bg-background/60 text-sm shadow-none"
            aria-label="Scan mode"
          >
            <SelectValue placeholder="Select scan mode" />
          </SelectTrigger>
          <SelectContent className="border-[0.5px] p-1">
            <SelectItem value="single">Single page</SelectItem>
            <SelectItem value="multi">Multi-page crawl</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        className="h-12 gap-3 px-6 text-sm"
        onClick={onScan}
        disabled={isScanning || !url.trim()}
      >
        {isScanning ? "Scanning..." : "Scan"}<ArrowRight className="size-4" aria-hidden="true" />
      </Button>

      {canCancel && !confirmingCancel && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-12 border-severity-critical/30 text-sm text-severity-critical-text hover:bg-severity-critical-bg hover:text-severity-critical-text"
          data-testid="cancel-scan-button"
          disabled={isCancelling}
          onClick={() => setConfirmingCancel(true)}
        >
          {isCancelling ? "Cancelling..." : "Cancel scan"}
        </Button>
      )}

      {canCancel && confirmingCancel && (
        <div
          className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-border bg-muted p-4"
          role="group"
          aria-label="Confirm scan cancellation"
        >
          <span className="text-sm font-medium text-foreground">Cancel this scan?</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            data-testid="confirm-cancel-scan"
            disabled={isCancelling}
            onClick={() => {
              setConfirmingCancel(false)
              onCancel?.()
            }}
          >
            {isCancelling ? "Cancelling..." : "Yes, cancel scan"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            data-testid="dismiss-cancel-scan"
            disabled={isCancelling}
            onClick={() => setConfirmingCancel(false)}
          >
            Keep scanning
          </Button>
        </div>
      )}
      </div>
    </section>
  )
}
