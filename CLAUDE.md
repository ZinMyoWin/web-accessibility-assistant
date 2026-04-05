# AccessAudit — Project Context for Claude Code

## Project
Final-year BSc project. Next.js 14 + FastAPI + Tailwind CSS + shadcn/ui.
Stack: Next.js (frontend), FastAPI (backend), PostgreSQL (db), Playwright (crawler), axe-core (scanner).

## Design system rules — always follow these

### Colors — use these token names, never raw hex
- Primary action:   brand-500  → `#1D9E75`  (bg-teal-500)
- Primary hover:    brand-700  → `#0F6E56`  (bg-teal-700)
- Critical badge:   severity-critical → bg `#FCEBEB`, text `#A32D2D`
- Serious badge:    severity-serious  → bg `#FAEEDA`, text `#854F0B`
- Moderate badge:   severity-moderate → bg `#E6F1FB`, text `#185FA5`
- Minor badge:      severity-minor    → bg `#EAF3DE`, text `#3B6D11`
- Surface 0:        bg-white
- Surface 1:        bg-gray-50  → `#F5F5F3`
- Text primary:     text-gray-900
- Text muted:       text-gray-400

### Typography — use these Tailwind classes exactly
- Page title:    text-display  (32px / 700)
- Section h1:    text-h1       (24px / 600)
- Panel title:   text-h2       (18px / 600)
- Card heading:  text-h3       (15px / 500)
- Body text:     text-body     (14px / 400)
- Labels/caps:   text-label    (12px / 500 / tracked)
- Captions:      text-caption  (11px / 400)
- Code/selectors: font-mono    (11px)

### Spacing — always use these, never arbitrary values
- Component internal gap: space-3 (12px)
- Card padding:           space-4 (16px)
- Between panels:         space-6 (24px)
- Page section breaks:    space-8 (32px)

### Border radius
- Buttons, inputs, metric cards: rounded-md (8px)
- Panels, cards:                 rounded-lg (12px)
- Filter pills, avatars:         rounded-full

### Border width
- All cards and panels: border border-[0.5px]
- Inputs on focus:      border  (1px) + ring-2 ring-brand-500/20
- Active nav accent:    border-l-2 border-brand-500

### Component patterns — always use these, never custom inline styles

Badge component (never write raw badge styles inline):
  <Badge severity="critical|serious|moderate|minor" />

Button variants:
  btn-primary  → bg-brand-500 text-white
  btn-outline  → border bg-transparent
  btn-ghost    → no border, muted text
  btn-danger   → bg-red-50 text-red-800

Metric card pattern:
  bg-gray-50 / rounded-md / p-4
  label: text-caption text-muted
  value: text-2xl font-medium
  delta: text-caption text-muted mt-1

Panel/card pattern:
  bg-white / rounded-lg / border border-[0.5px] / p-4

Progress bar:
  track: h-1.5 bg-gray-100 rounded-full
  fill:  bg-brand-500 → brand-300 (left to right)

## File structure
src/
  app/           → Next.js pages
  components/
    ui/          → Badge, Button, Card, MetricCard, ProgressBar
    dashboard/   → DashboardShell, Sidebar, TopBar
    scan/        → ScanForm, IssueList, SeverityChart, PageList
  lib/           → api client, utils
  styles/        → globals.css, tokens.css

## Rules for every component Claude Code writes
1. Never hardcode hex values — use Tailwind token classes or CSS vars
2. Always use the Badge component for severity — never raw span with colour styles
3. Sidebar nav active state: border-l-2 border-brand-500 text-brand-700
4. Every scan result card must show: severity badge, issue text, selector (font-mono), page count pill
5. Progress bar must show both label text and percentage number
6. All metric cards follow the same 3-line pattern: label / value / delta
```

**Step 2 — reference your config files**

Claude Code also reads `tailwind.config.js` directly from the filesystem, so keep your token definitions there as shown earlier. The `CLAUDE.md` acts as the *rules* layer on top — it tells Claude Code which tokens to reach for and why.

**Step 3 — the prompt pattern that locks consistency**

When asking Claude Code to build anything, start with:
```
Following the design system in CLAUDE.md, build a [component name].
Use the Badge component for severity, MetricCard for counts,
and never hardcode colours.