# Sheet Merger — version comparison

Version: **1.1.1**. Compare spreadsheet exports by record ID alongside the existing batch-merge workflow.

## Scope and behavior

Choose original and updated CSV/XLSX files. Matching headers and one recognizable record ID produce results automatically. Ambiguous identifiers, renamed fields, disjoint IDs and multiple worksheets require focused confirmation. Unknown fields must be mapped or explicitly excluded. Full mapping and normalization controls remain available under Advanced matching settings.

Results include additions, removals, changes and unchanged records, concise field differences, status filters, ID search, source-row provenance and a complete three-sheet Excel report. Duplicate/empty IDs, missing selected formula results and unsupported report values block comparison with diagnostics. All processing runs locally in a dedicated browser worker.

## Verification

See [verification report](docs/verification/compare/REPORT.md): 50 unit tests, 25 Chromium/WebKit comparison checks with 3 explained engine-specific skips, 2 original merge/backup regression flows, catalog parity, production build and formatting checks passed. A 20,000-record-per-side / 50-field fixture and the complete 20,001-record report were verified. Desktop and narrow mobile views were inspected. Earlier full merge-regression results are recorded separately.

## Limitations

CSV/XLSX comparison supports one unique ID, one worksheet per version, 20,000 nonblank rows per side and 50 compared fields plus the ID. The existing 50 MB input limit applies. Comparison state is temporary in this tab and excluded from merge backups: changing workspaces retains it, reload/close clears it. Saved scalar values are compared as text, with native dates/times represented as ISO values. Empty cells and empty text compare equally. Display formatting is ignored; formulas are not recalculated. Composite keys, fuzzy matching, numeric tolerance, joined output and cloud sync are outside this version.

## Launch handoff

- Repository: https://github.com/quinnqin-dev/sheet-merger .
- App: https://sheet-merger-80c7.onrender.com/ .
- Release: v1.1.1. The release tag identifies the published source revision.
- Intended users: people checking migrations, inventory changes and recurring exports who need to compare records independently of row order.
- Demo: Compare versions -> Try sample inventory -> confirm Stock -> Quantity once. SKU is selected automatically. Show one added, removed, changed and unchanged record; Notebook stock changes from 20 to 25. All sample records are fictional.
- Run locally: `npm --prefix frontend run dev` (http://127.0.0.1:5173/). Build with `npm --prefix frontend run build`.
- Reusable product screenshots and verification metadata: `docs/verification/compare/`.
- Dependencies: the existing React/TypeScript/Vite, spreadsheet reader, fflate and browser APIs. No new package, account, paid API or database is required.
- Deployment: the existing Render static-site configuration publishes `frontend/dist` from main. Check the release and live app for current publication status.

This release adds a verified workflow; recurring usage and willingness to pay have not been established by software tests.
