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
  onUrlChange: (value: string) => void
  onScanModeChange: (value: "single" | "multi") => void
  onUseTestPage: () => void
  onScan: () => void
}

export function ScanToolbar({
  url,
  scanMode,
  isScanning,
  onUrlChange,
  onScanModeChange,
  onUseTestPage,
  onScan,
}: ScanToolbarProps) {
  return (
    <header className="flex items-center gap-2.5 border-b-[0.5px] border-border bg-card px-4 py-2.5 pl-14 md:px-6 md:py-3 md:pl-6">
      <input
        className="h-9 flex-1 rounded-[var(--radius)] border-[0.5px] border-input bg-muted px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_2px_rgba(29,158,117,0.2)]"
        type="url"
        placeholder="https://example.com"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onScan()}
      />
      <div className="hidden shrink-0 md:block">
        <Select value={scanMode} onValueChange={onScanModeChange}>
          <SelectTrigger
            className="min-w-[164px] border-[0.5px] bg-muted p-1 shadow-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/20"
            aria-label="Scan mode"
          >
            <SelectValue placeholder="Select scan mode" />
          </SelectTrigger>
          <SelectContent className="border-[0.5px] p-1">
            <SelectItem value="single">Single page</SelectItem>
            <SelectItem value="multi" disabled>
              Multi-page (soon)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <button
        className="shrink-0 whitespace-nowrap bg-transparent text-[11px] text-muted-foreground underline underline-offset-2 hover:text-primary"
        onClick={onUseTestPage}
      >
        Use test page
      </button>
      <button
        className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[var(--radius)] border-[0.5px] border-primary bg-primary px-5 text-sm font-medium text-white transition-[background] duration-150 hover:bg-accent-foreground disabled:cursor-not-allowed disabled:opacity-65"
        onClick={onScan}
        disabled={isScanning || !url.trim()}
      >
        {isScanning ? "Scanning..." : "Scan"}
      </button>
    </header>
  )
}
