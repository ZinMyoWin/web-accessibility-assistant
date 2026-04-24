/* Static demo data for the Reports page — matches the HTML mockup */

export const reportMeta = {
  url: "gov.uk",
  scanDate: "23 Apr 2025 · 14:32 UTC",
  scanMode: "Multi-page (sitemap)",
  totalIssues: 42,
  wcagLevel: "WCAG 2.2 AA",
  status: "Action needed",
  score: 57,
  pagesScanned: 12,
  scanDuration: "1m 48s",
  breadcrumb: [
    { label: "Dashboard", href: "/" },
    { label: "Scan History", href: "/scan-history" },
    { label: "gov.uk — 23 Apr 2025", href: "#" },
  ],
}

export const severityBreakdown = [
  { key: "critical" as const, label: "Critical", count: 14, fraction: 0.33 },
  { key: "serious" as const, label: "Serious", count: 12, fraction: 0.29 },
  { key: "moderate" as const, label: "Moderate", count: 11, fraction: 0.26 },
  { key: "minor" as const, label: "Minor", count: 5, fraction: 0.12 },
]

export const wcagPrinciples = [
  { name: "Perceivable", issues: 18, desc: "Content adaptable and distinguishable", icon: "eye" },
  { name: "Operable", issues: 12, desc: "Keyboard, timing, seizures, navigation", icon: "pointer" },
  { name: "Understandable", issues: 8, desc: "Readable, predictable, input assistance", icon: "book" },
  { name: "Robust", issues: 4, desc: "Compatible with assistive technologies", icon: "shield" },
]

export type PageRow = {
  url: string
  status: "pass" | "fail"
  issues: number
  critical: number
  serious: number
  moderate: number
  minor: number
  elements: { element: string; issue: string; severity: "critical" | "serious" | "moderate" | "minor"; wcag: string }[]
}

export const pagesData: PageRow[] = [
  {
    url: "gov.uk/",
    status: "fail",
    issues: 12,
    critical: 4,
    serious: 3,
    moderate: 3,
    minor: 2,
    elements: [
      { element: '<img src="/assets/hero.jpg" class="hero-image">', issue: "Image missing alt text", severity: "critical", wcag: "1.1.1" },
      { element: '<div class="carousel" role="region">', issue: "Interactive element not keyboard accessible", severity: "critical", wcag: "2.1.1" },
      { element: '<span class="body-secondary">', issue: "Insufficient colour contrast (2.8:1)", severity: "serious", wcag: "1.4.3" },
    ],
  },
  {
    url: "gov.uk/contact",
    status: "fail",
    issues: 8,
    critical: 3,
    serious: 2,
    moderate: 2,
    minor: 1,
    elements: [
      { element: '<input type="email" placeholder="Email">', issue: "Form input missing label", severity: "critical", wcag: "1.3.1" },
      { element: '<div class="modal">', issue: "Keyboard trap in modal dialog", severity: "serious", wcag: "2.1.2" },
    ],
  },
  {
    url: "gov.uk/publications",
    status: "fail",
    issues: 6,
    critical: 2,
    serious: 2,
    moderate: 1,
    minor: 1,
    elements: [],
  },
  {
    url: "gov.uk/guidance/style-guide",
    status: "fail",
    issues: 5,
    critical: 1,
    serious: 2,
    moderate: 1,
    minor: 1,
    elements: [],
  },
  {
    url: "gov.uk/about",
    status: "pass",
    issues: 0,
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    elements: [],
  },
]

export type CategoryGroup = {
  name: string
  critical: number
  serious: number
  moderate: number
  minor: number
  total: number
  icon: string
}

export const categoriesData: CategoryGroup[] = [
  { name: "Images & Alt Text", critical: 7, serious: 2, moderate: 0, minor: 1, total: 10, icon: "image" },
  { name: "Colour & Contrast", critical: 0, serious: 8, moderate: 3, minor: 0, total: 11, icon: "palette" },
  { name: "Keyboard & Focus", critical: 4, serious: 0, moderate: 2, minor: 1, total: 7, icon: "keyboard" },
  { name: "Forms & Labels", critical: 3, serious: 2, moderate: 1, minor: 0, total: 6, icon: "form" },
  { name: "ARIA & Semantics", critical: 0, serious: 0, moderate: 5, minor: 3, total: 5, icon: "code" },
]

export type AiSuggestion = {
  title: string
  severity: "critical" | "serious" | "moderate" | "minor"
  wcag: string
  pages: number
  confidence: "High" | "Medium" | "Low"
  explanation: string
  file: string
  line: number
  removed: string
  added: string
}

export const aiSuggestions: AiSuggestion[] = [
  {
    title: "Image missing alternative text",
    severity: "critical",
    wcag: "1.1.1",
    pages: 7,
    confidence: "High",
    explanation: 'Add a descriptive alt attribute to each informative image. The suggested alt text below was inferred from surrounding page context. For decorative images, use alt="".',
    file: "gov.uk/",
    line: 247,
    removed: '<img src="/assets/hero.jpg" class="hero-image">',
    added: '<img src="/assets/hero.jpg" class="hero-image" alt="Aerial view of the Houses of Parliament and the River Thames">',
  },
  {
    title: "Form inputs missing labels",
    severity: "critical",
    wcag: "1.3.1",
    pages: 5,
    confidence: "High",
    explanation: "Associate a <label> with each input using a matching for/id pair. Placeholder text alone does not satisfy the labelling requirement as it disappears once typing begins.",
    file: "gov.uk/contact",
    line: 134,
    removed: '<input type="email" placeholder="Enter your email" class="form-input">',
    added: '<label for="email">Email address</label>\n<input type="email" id="email" name="email" placeholder="e.g. name@example.com" class="form-input">',
  },
  {
    title: "Insufficient colour contrast ratio",
    severity: "serious",
    wcag: "1.4.3",
    pages: 8,
    confidence: "Medium",
    explanation: "Darken secondary text from #9CA3AF (ratio 2.8:1) to at least #6B7280 (ratio 4.6:1) against a white background. Verify all interactive states also meet the threshold.",
    file: "styles/typography.css",
    line: 22,
    removed: "  color: #9CA3AF; /* ratio 2.8:1 — FAIL */",
    added: "  color: #6B7280; /* ratio 4.6:1 — PASS */",
  },
  {
    title: "Keyboard trap in modal dialog",
    severity: "serious",
    wcag: "2.1.2",
    pages: 1,
    confidence: "High",
    explanation: "Implement a focus trap: query all focusable elements inside the modal, cycle focus within them on Tab/Shift+Tab, and return focus to the trigger element on close or Escape.",
    file: "components/Modal.js",
    line: 12,
    removed: "function openModal(modal, trigger) {",
    added: "function openModal(modal, trigger) {\n  const focusable = modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex=\"-1\"])');\n  const first = focusable[0]; const last = focusable[focusable.length - 1];",
  },
]
