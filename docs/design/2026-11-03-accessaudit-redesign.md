# AccessAudit interface redesign

## What

A complete visual redesign of the existing Next.js frontend: home, about, login,
registration, password recovery, legacy signup, dashboard, issues, scan history,
reports and preferences. Existing FastAPI APIs, hooks, authentication, persistence,
queue management and report mapping remain the owners of application behavior.

## Why

The original interface uses small type, low-contrast muted text, tightly packed
workspace panels and repeated gradient/card treatments. Mobile issue details are
hidden, the sidebar lacks modal keyboard behavior, and history rows are mouse-only.
These are especially significant for an accessibility product.

The reference review used the live OpenAI and monday.com homepages on 3 November
2026. OpenAI informs the whitespace, restrained chrome and action hierarchy;
monday.com informs approachable product previews and selective, purposeful color.
Neither layout or brand is copied.

## Visual direction

AccessAudit should feel like a clear, considered inspection workspace. Its visual
signature is a legible example finding beside its repair, rather than decorative
artwork. The initial generic centered score-ring hero is replaced by an asymmetric
product-led composition. Repeated identical feature cards become varied, purposeful
sections. No gradients, dotted meshes or repeated scroll reveals.

| Foundation | Value / purpose |
| --- | --- |
| Canvas | `#F6F7FB` quiet application background |
| Surface | `#FFFFFF` readable content and form areas |
| Ink | `#202633` principal text |
| Muted | `#596174` secondary text |
| Action | `#3659D9` primary actions and focus |
| Accent | `#E2E8FF` pale periwinkle selected surfaces |

Severity colors retain their meaning. Mint indicates successful checks; amber and
red identify attention and errors. They do not replace text labels.

Typography uses a single Manrope family, with system fallbacks. Public headlines
use fluid 40–76px sizes and tight tracking; workspace headings use 28–32px; body
text uses 14–18px with comfortable line height. Code alone uses monospace.
Content is left aligned, paragraphs stay near 65 characters. Spacing uses a 4px
base. Controls use 10px corners, panels 18px; shadows are reserved for elevation.
Transitions last 150–200ms and respond to deliberate user interaction. Respect
the operating system reduced-motion preference across the interface.

```text
Public desktop                   Workspace desktop
logo     navigation     action   sidebar | page title / context / actions
                                 sidebar | scan input / mode / run
headline        finding preview  sidebar | overview / severity
explanation     repair guidance  sidebar | findings / detail
primary action

Mobile
compact header / accessible menu
single-column content
full-width scan controls
issue details in an accessible dialog
```

## How / implementation and validation

1. Audit route/component/test contracts and capture current pages where accessible.
2. Replace global semantic tokens and typography; restyle existing UI primitives.
3. Redesign public layouts and content, shared header/footer and product preview.
4. Redesign canonical/legacy account screens while retaining validation and routes.
5. Rebuild workspace shell and route layouts; restore mobile details/navigation,
   make history actions keyboard operable and associate preference controls.
6. Run existing unit tests, TypeScript, production build and browser regression
   tests. Inspect desktop/tablet/mobile, focus, overflow, reduced motion and print.
7. Update project documentation with the final result and evidence limits.

No new dependencies, backend migration or environment variables are required.
Theme/high-contrast/density settings currently persist without globally applying;
this redesign does not silently add those behaviors. Placeholder legal links need
real content before a public launch. Browser tests use existing deterministic API
fixtures; live external authentication and real scan providers require separate
integration verification.

## Component and interaction rules

- Primary buttons use the blue action token and a 44px minimum default height;
  account actions use 48px. Secondary actions use white surfaces and stronger
  control boundaries. Destructive actions retain their confirmation dialogs.
- Inputs use a separate `#858FA4` boundary token so their edges remain visible
  without making every card border dark. Focus uses a 2px blue indicator with
  separation from the control. Placeholders are secondary text, never labels.
- Keep page titles, descriptive context and actions together. Workspace pages use
  16/24/32px horizontal gutters at small/medium/large sizes. The desktop sidebar
  is 248px; below 768px navigation moves to a modal opened by the mobile header.
- Issue inspection uses a side panel from 1024px and a modal below that width.
  Report summaries use three columns from 1280px; smaller screens stack them.
  Keep long URLs and code readable through wrapping or local scrolling.
- Cards group related information. Use separators and open spacing within a
  group rather than nesting identical cards for every line of content.
- Keep successful state copy specific. Errors retain their message and offer a
  next action. Empty reports link to scanning; empty histories retain New scan;
  empty findings explain how to change filters or start an audit.
- Severity always includes text. Color is supplementary. The primary text and
  white button text have approximately 6.2:1 and 5.85:1 contrast respectively
  against their associated backgrounds. Score numerals use the darker semantic
  severity text colors.

## Audit and verification evidence

| Area | Audit finding | Result |
| --- | --- | --- |
| Public pages | Repeated gradients, highlighted headline fragment, uniform cards and scroll reveals | Product-led split hero, open feature layout, practical workflow, restrained color |
| Account access | Separate legacy signup layout and incorrect tablist semantics | Shared AuthShell, account navigation landmark, larger labeled controls |
| Workspace navigation | Mobile overlay without focus management, overlapping menu button | In-flow mobile header and Radix modal with Escape/focus return |
| Dashboard | Dense type, ambiguous URL field and purely visual progress | Readable scan form, named controls and announced progress |
| Issues | Detail inspector hidden on mobile | Complete responsive inspector with focus restoration |
| History | Mouse-only rows, imitation checkboxes and no-op actions | Real links, native comparison checkboxes and visible working report actions |
| Reports | Fixed-height panes, poor wrapping and page list hidden in print | Natural page flow, responsive summaries and preserved printed findings |
| Preferences | Unassociated labels, faded descriptions and stale provider selection | Named fields, readable disabled-state context and draft-driven provider state |

The source audit covered all routes and their dedicated component folders. A
baseline home screenshot, reference captures, and final desktop/mobile/tablet
screenshots were inspected locally. Generated captures live in the ignored
`output/playwright/` folder; they use deterministic test scan data.

The browser regression suite checks all 12 routes at 320, 375, 768, 1024 and 1440px
for horizontal overflow, a main heading and automated WCAG A/AA violations using
the repository's vendored axe engine. Separate flows cover navigation/inspector
focus return, report print visibility and the empty-report next action. Existing
login, route protection, scan request and cancellation tests remain in place.

Automated checks do not establish complete WCAG conformance. Manual assistive
technology use and live backend/provider/OAuth verification remain separate.

Final validation on 3 November 2026:

- Production build: passed, all routes generated successfully.
- TypeScript: passed (`tsc --noEmit --incremental false`).
- Vitest: 17 files, 55 tests passed.
- Playwright against the production build: 16 tests passed.
- Responsive/accessibility matrix: 12 routes × 5 widths = 60 page checks,
  no document horizontal overflow or detected WCAG A/AA violations.
- Desktop, phone, tablet, modal and print screenshots inspected. Mobile menus
  and inspector support Escape and focus return; report findings remain in print.
- No backend, hook, context, API mapping, dependency or environment changes.
