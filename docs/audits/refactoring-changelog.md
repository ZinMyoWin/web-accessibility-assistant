# Refactoring decisions

## 6 November 2026: initial discovery and documentation

**What changed:** Added a module inventory, coverage tracker, audit and developer-facing guides. Existing project changes in the working tree predate this documentation effort and are not attributed to it.

**Why:** Give a new developer a map of the implementation and record important risks without confusing observations with fixes.

**Production refactoring:** None in this initial pass. The highest-impact candidates involve security, worker ownership, authentication or externally visible behavior. They require focused characterization, design and verification before changes can be called behavior-preserving. See the [audit](code-quality-report.md).

**Verification:** Refer to the current [progress tracker](../PROGRESS.md); no live deployment, migration or external service is implied by a documentation change.
