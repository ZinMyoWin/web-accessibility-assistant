# AccessAudit Frontend Guidance

This file records frontend design conventions for AI-assisted changes. The current implementation is the source of truth when this file and code disagree.

## Current Stack

- Next.js 15 and React 19
- Tailwind CSS v4 configured through `frontend/src/app/globals.css`
- reusable UI primitives in `frontend/src/components/ui/`
- route-specific pages in `frontend/src/app/`

There is no `tailwind.config.js`. Theme tokens are defined in the `@theme` and `:root` blocks in `frontend/src/app/globals.css`.

## Design Tokens

Use the existing token classes and CSS variables rather than adding new raw colors or spacing values.

- brand colors: `brand-50`, `brand-100`, `brand-300`, `brand-500`, `brand-700`, `brand-900`
- surfaces: `surface-0`, `surface-1`, `surface-2`
- severity colors: `severity-critical`, `severity-serious`, `severity-moderate`, `severity-minor`
- spacing: `sp1`, `sp2`, `sp3`, `sp4`, `sp5`, `sp6`, `sp8`, `sp10`, `sp12`, `sp16`, `sp20`, `sp28`
- radii: `rounded-md` for controls and `rounded-lg` for panels unless an existing component uses another value

## Component Rules

1. Reuse components in `frontend/src/components/ui/` before creating a new primitive.
2. Reuse feature components in `frontend/src/components/home/`, `issues/`, `reports/`, `preferences/`, and `scan-history/`.
3. Keep shared API and data mapping in `frontend/src/lib/`.
4. Keep dashboard-wide layout behavior in `frontend/src/components/dashboard/DashboardShell.tsx`.
5. Use `lucide-react` for interface icons.
6. Preserve keyboard focus, labels, semantic controls, and reduced-motion behavior.
7. Add or update Vitest/Testing Library tests when changing scan state, queue controls, reports, saved-scan mapping, or auth behavior.

## Verification

Run from `frontend/`:

```powershell
npx tsc --noEmit
npm test
npm run build
```

Read `AGENTS.md` for repository-wide workflow and `docs/architecture/system-architecture.md` for current application architecture.
