import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { downloadTextFile } from "@/lib/download"

class CapturingBlob {
  static readonly instances: CapturingBlob[] = []
  readonly parts: BlobPart[]
  readonly type: string

  constructor(parts: BlobPart[], options?: BlobPropertyBag) {
    this.parts = parts
    this.type = options?.type ?? ""
    CapturingBlob.instances.push(this)
  }

  text(): string {
    return this.parts.map((part) => String(part)).join("")
  }
}

describe("downloadTextFile", () => {
  const createObjectURL = vi.fn((_blob: Blob) => "blob:mock-url")
  const revokeObjectURL = vi.fn()
  let clickedAnchor: HTMLAnchorElement | null = null
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubGlobal("Blob", CapturingBlob)
    CapturingBlob.instances.length = 0
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    })
    clickedAnchor = null
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedAnchor = this
      })
  })

  afterEach(() => {
    clickSpy.mockRestore()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.unstubAllGlobals()
  })

  it("downloads the content under the requested filename and cleans up", () => {
    downloadTextFile(
      "scan-1-repair-suggestions.md",
      "# Repair suggestions\n",
      "text/markdown;charset=utf-8"
    )

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(CapturingBlob.instances).toHaveLength(1)
    expect(CapturingBlob.instances[0].text()).toBe("# Repair suggestions\n")
    expect(CapturingBlob.instances[0].type).toBe("text/markdown;charset=utf-8")

    expect(clickedAnchor).not.toBeNull()
    expect(clickedAnchor?.download).toBe("scan-1-repair-suggestions.md")
    expect(clickedAnchor?.href).toContain("blob:mock-url")
    // The temporary link is removed from the document.
    expect(clickedAnchor && document.body.contains(clickedAnchor)).toBe(false)

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
  })

  it("defaults to a plain text content type", () => {
    downloadTextFile("report.txt", "hello")

    expect(CapturingBlob.instances[0].type).toBe("text/plain;charset=utf-8")
  })
})
