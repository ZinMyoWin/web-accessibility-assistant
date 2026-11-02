/**
 * Small browser download helper shared by report/AI export features.
 *
 * Kept in `lib/` so the DOM plumbing lives in one place and can be unit
 * tested independently of the component that triggers it.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  contentType = "text/plain;charset=utf-8"
): void {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
