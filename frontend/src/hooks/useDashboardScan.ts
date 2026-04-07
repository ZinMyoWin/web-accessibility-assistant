"use client"

import { useEffect, useRef, useState } from "react"
import { API, TEST_URL } from "@/components/home/constants"
import type { ProgressState, ScanResponse } from "@/components/home/types"

type ScanErrorBody = {
  detail?: string
}

export function useDashboardScan() {
  const [url, setUrl] = useState(TEST_URL)
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [error, setError] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState(
    "Ready to scan - enter a URL above"
  )
  const [progressState, setProgressState] = useState<ProgressState>("idle")

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current)
      }
    }
  }, [])

  function setTestUrl() {
    setUrl(TEST_URL)
  }

  function beginProgress() {
    setProgress(0)
    setProgressState("active")
    setProgressText("Connecting to page...")

    let currentProgress = 0
    progressRef.current = setInterval(() => {
      currentProgress += Math.random() * 12 + 3
      if (currentProgress > 92) {
        currentProgress = 92
      }

      setProgress(currentProgress)

      if (currentProgress < 25) {
        setProgressText("Fetching page content...")
      } else if (currentProgress < 50) {
        setProgressText("Running custom accessibility checks...")
      } else if (currentProgress < 75) {
        setProgressText("Injecting axe-core engine...")
      } else {
        setProgressText("Capturing screenshots...")
      }
    }, 600)
  }

  function stopProgress() {
    if (progressRef.current) {
      clearInterval(progressRef.current)
      progressRef.current = null
    }
  }

  async function handleScan() {
    if (isScanning || !url.trim()) {
      return
    }

    setIsScanning(true)
    setError("")
    setResult(null)
    beginProgress()

    try {
      const response = await fetch(`${API}/scan/page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        const body = (await response.json()) as ScanErrorBody
        throw new Error(body.detail || "Scan request failed.")
      }

      const data = (await response.json()) as ScanResponse
      setResult(data)
      setProgress(100)
      setProgressText(
        `Scan complete - ${data.summary.total_issues} issue${data.summary.total_issues !== 1 ? "s" : ""} found`
      )
      setProgressState("done")
    } catch (scanError) {
      const message =
        scanError instanceof Error
          ? scanError.message
          : "Unexpected error while scanning."
      setError(message)
      setProgress(0)
      setProgressText("Scan failed - check the URL and try again")
      setProgressState("error")
    } finally {
      stopProgress()
      setIsScanning(false)
    }
  }

  return {
    url,
    setUrl,
    setTestUrl,
    result,
    error,
    isScanning,
    progress,
    progressText,
    progressState,
    handleScan,
  }
}
