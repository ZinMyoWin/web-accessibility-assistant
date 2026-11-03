"use client"

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react"
import type { ScanNotification, ScanNotificationTone } from "@/lib/scan-notifications"
import { cn } from "@/lib/utils"

const toneStyles: Record<
  ScanNotificationTone,
  { container: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    container: "border-brand-500/25 bg-secondary text-accent-foreground",
    icon: "text-brand-700",
    Icon: CheckCircle2,
  },
  error: {
    container:
      "border-severity-critical/25 bg-severity-critical-bg text-severity-critical-text",
    icon: "text-severity-critical-text",
    Icon: AlertCircle,
  },
  warning: {
    container:
      "border-severity-serious/25 bg-severity-serious-bg text-severity-serious-text",
    icon: "text-severity-serious-text",
    Icon: AlertTriangle,
  },
  neutral: {
    container: "border-border bg-muted text-muted-foreground",
    icon: "text-muted-foreground",
    Icon: Info,
  },
}

type ScanNotificationsProps = {
  notifications: ScanNotification[]
  onDismiss: (kind: ScanNotification["kind"]) => void
  /** Set false when the user prefers reduced motion. */
  animate?: boolean
}

/**
 * Dismissible in-app notifications for terminal dashboard scans.
 *
 * The region is announced politely so screen reader users hear scan results
 * without interrupting other output.
 */
export function ScanNotifications({
  notifications,
  onDismiss,
  animate = true,
}: ScanNotificationsProps) {
  if (notifications.length === 0) {
    return null
  }

  return (
    <div
      className="flex flex-col gap-2"
      role="status"
      aria-live="polite"
      aria-label="Scan notifications"
      data-testid="scan-notifications"
    >
      {notifications.map((notification) => {
        const { container, icon, Icon } = toneStyles[notification.tone]

        return (
          <div
            key={notification.kind}
            data-testid={`scan-notification-${notification.kind}`}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-5 py-4",
              container,
              animate && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", icon)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{notification.title}</div>
              <div className="mt-1 text-sm leading-relaxed">
                {notification.body}
              </div>
            </div>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Dismiss notification"
              data-testid="dismiss-scan-notification"
              onClick={() => onDismiss(notification.kind)}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
