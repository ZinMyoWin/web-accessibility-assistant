# Vendored third-party assets

## `axe.min.js`

- **Package:** axe-core (Deque Systems, Inc.)
- **Version:** 4.10.2
- **Source:** https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js
- **File size:** 553,290 bytes (~540 KB), minified
- **SHA-256:** `b511cd9dec01c76f4b2ad1723b66b6db37d4c2eb4ed199076e1829d9ee7b75e3`
- **License:** Mozilla Public License 2.0 (MPL-2.0). Copyright (c) 2015 - 2024
  Deque Systems, Inc. The full upstream copyright/license banner is retained at
  the top of `axe.min.js`, as required by the MPL. A copy of the license is
  available at https://mozilla.org/MPL/2.0/.

> Note: the task description said "Apache-2.0 notice"; the actual upstream
> license shipped in the axe-core 4.10.2 bundle is MPL-2.0, so the real notice
> is recorded here instead of an incorrect one.

### Why it is vendored

The scanner used to download axe-core from a CDN on first use of each process
(~275 ms cold-path latency, plus a network/reliability dependency). It is now
loaded from this file first; the CDN remains a last-resort fallback.

- Override the path with the `AXE_SCRIPT_PATH` environment variable.
- The worker warms the module cache at startup (`warm_axe_cache()`), so the
  first user scan never pays the load.

### How to update

```powershell
Invoke-WebRequest `
  -Uri "https://cdnjs.cloudflare.com/ajax/libs/axe-core/<version>/axe.min.js" `
  -OutFile "backend/app/assets/axe.min.js"
(Get-FileHash backend/app/assets/axe.min.js -Algorithm SHA256).Hash
```

Update the version/size/SHA-256 above and in the regression test
`backend/tests/test_scan_perf_unit.py` whenever the asset changes.
