"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { SectionCard, FieldRow } from "@/components/preferences/SectionCard"
import { cn } from "@/lib/utils"

const providers = ["openai", "deepseek", "anthropic"] as const
type Provider = (typeof providers)[number]

const providerLabels: Record<Provider, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
}

const providerModels: Record<Provider, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"],
}

interface AiProviderSectionProps {
  onDirty: () => void
}

export function AiProviderSection({ onDirty }: AiProviderSectionProps) {
  const [activeProvider, setActiveProvider] = useState<Provider>("openai")
  const [connectedProvider] = useState<Provider | null>("openai")

  return (
    <SectionCard
      id="sec-ai"
      title="AI Provider"
      subtitle="API keys and model selection for repair suggestions"
      iconClass="bg-[#F3F0FF] text-[#6D28D9]"
      icon={
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-[15px]">
          <path d="M3 8a5 5 0 0110 0M8 3v1M8 12v1M12.2 5.2l-.7.7M4.5 10.5l-.7.7M13 8h-1M4 8H3" strokeLinecap="round" />
        </svg>
      }
    >
      {/* Provider tabs */}
      <div className="flex gap-2">
        {providers.map((p) => (
          <button
            key={p}
            onClick={() => setActiveProvider(p)}
            className={cn(
              "flex items-center gap-2 rounded-md border-[0.5px] px-3 py-2 text-xs font-medium transition-all",
              activeProvider === p
                ? "border-primary bg-card text-accent-foreground shadow-[0_0_0_2px_rgba(29,158,117,0.08)]"
                : "border-input bg-muted text-muted-foreground hover:border-primary/50 hover:text-accent-foreground"
            )}
          >
            <span className={cn("size-[7px] rounded-full", activeProvider === p ? "bg-primary" : "bg-input")} />
            {providerLabels[p]}
            {connectedProvider === p && (
              <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium text-accent-foreground">
                Connected
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Provider panel */}
      {providers.map((p) =>
        activeProvider !== p ? null : (
          <div key={p} className="flex flex-col gap-4">
            <FieldRow label="API Key">
              <div className="relative flex items-center">
                <Input
                  type="password"
                  defaultValue={p === "openai" ? "sk-••••••••••••••••••••••••••••••••••••••••jK9p" : ""}
                  placeholder={`sk-••••••••••••••••••••••••••`}
                  className="h-9 pr-20 font-mono text-xs"
                  onChange={onDirty}
                />
                <div className="absolute right-2 flex items-center gap-1.5">
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
                      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
                      <circle cx="8" cy="8" r="2" />
                    </svg>
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]">
                    Test
                  </Button>
                </div>
              </div>
              {/* Connection status */}
              <div className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2.5 text-[11px]",
                p === "openai"
                  ? "bg-secondary text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                <span className={cn("size-[7px] rounded-full", p === "openai" ? "bg-primary" : "bg-muted-foreground")} />
                {p === "openai" ? "Connected · Last verified 2 hours ago" : "Not configured"}
              </div>
            </FieldRow>

            <FieldRow label="Model" hint="Used for repair suggestion generation and natural language explanations.">
              <Select defaultValue={providerModels[p][0]} onValueChange={() => onDirty()}>
                <SelectTrigger className="h-9 border-input bg-muted text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerModels[p].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
        )
      )}

      <div className="h-px bg-border" />

      {/* Active provider */}
      <FieldRow label="Active provider for suggestions" hint="Which provider is used when generating repair suggestions" horizontal>
        <Select defaultValue="OpenAI" onValueChange={() => onDirty()}>
          <SelectTrigger className="h-9 w-40 border-input bg-muted text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p} value={providerLabels[p]}>{providerLabels[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Generate suggestions automatically" hint="Run AI suggestions immediately after each scan completes" horizontal>
        <Switch defaultChecked onCheckedChange={() => onDirty()} />
      </FieldRow>
    </SectionCard>
  )
}
