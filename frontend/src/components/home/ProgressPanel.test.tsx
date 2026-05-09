import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ProgressPanel } from "@/components/home/ProgressPanel"

describe("ProgressPanel", () => {
  it("renders active scan progress and percentage", () => {
    render(
      <ProgressPanel
        progress={42}
        progressText="Running axe-core across crawled pages..."
        progressState="active"
      />
    )

    expect(screen.getByText("Running axe-core across crawled pages...")).toBeInTheDocument()
    expect(screen.getByText("42%")).toBeInTheDocument()
  })

  it("renders completed scan state", () => {
    render(
      <ProgressPanel
        progress={100}
        progressText="Scan complete - 0 issues found across 1 page"
        progressState="done"
      />
    )

    expect(screen.getByText("Scan complete - 0 issues found across 1 page")).toBeInTheDocument()
    expect(screen.getByText("100%")).toBeInTheDocument()
  })
})
