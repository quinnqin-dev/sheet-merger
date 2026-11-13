# Sheet Merger v1.1.1 — comparison verification

Verified at 2026-11-14T00:00:35+08:00. Runtime source verified on the comparison feature branch before release preparation; release-only documentation and ignore-rule changes do not alter that code.

## Outcomes

- Version **1.1.1** uses automatic matching and focused confirmation to reduce setup steps.
- Production build and source formatting passed. Frontend unit suite: **50 passed**, including seven new automatic-planning cases and the existing comparison/merge tests.
- Focused comparison checks across Chromium and WebKit: **25 passed, 3 explained skips** across the primary suite and corrected field-limit follow-up. Chromium skips the WebKit-only stopped-server case; WebKit skips simulated offline mode and the Chromium scale case. Real offline WebKit comparison is covered by stopping its local server.
- Selected original merge regressions: **2 passed**, covering offline merge/saved workspaces and full backup/recovery. The previous v1.1.0 full Chromium run remains historical evidence (29 passed / 2 skips); it was not rerun in full for this UI revision.
- English/Chinese catalog parity: **1 passed**.
- Automatic comparison succeeds without visible setup controls for matched headers and one recognizable ID. Multiple candidate identifiers and disjoint IDs require confirmation. Known renames are proposed for review; unknown fields require explicit mapping or exclusion. Multiple worksheets require confirmation before automatic planning.
- Equivalent fictional inventory inputs recreated in memory as XLSX were checked on the actual local preview. SKU was selected automatically, Stock → Quantity required one confirmation, and all four expected counts were one. The Chinese 320-pixel review and results had no document overflow.
- The unchanged report exporter retains its earlier independent openpyxl verification; current unit/browser tests recheck report contents, leading-zero IDs, literal text and full record coverage.

This verifies software behavior and reduced configuration steps. Real-user repeat use, adoption and willingness to pay remain unvalidated.

## Data correctness and failures checked

Independent expected fixtures verify shuffled rows/columns, renamed mapped fields, added/removed/changed/unchanged counts, cell-level changes, leading-zero IDs, exact decimal spelling, blanks, optional trim/case matching, and normalization-induced duplicate IDs. Invalid or reused mappings, empty/duplicate keys, selected formulas with missing cached results, overlong/control-character values, and row/field limits are rejected. Excluded columns are disclosed and do not affect difference counts.

CSV fixtures exercise a preamble and explicit semicolon/tab separators, quoted multiline values, alternate header rows, and unexpected extra cells. XLSX fixtures exercise multiple worksheets, numeric zero masks, uncached formulas and two timestamps on the same calendar day. Exact selected source values are exported as inline strings, including strings beginning with `=` or `@`; no formula is created. Excel escape-like literal text and XML-sensitive characters round-trip. The report XML retains a CR entity; SheetJS itself normalizes CRLF to LF when reading text.

The stateful service invalidates results before new input, worksheet selection or comparison. Tests ensure failed loads and selections cannot export a previous result. The original merge workspace survives navigation through the comparison workspace.

## Measured capacity

A Chromium fixture uses **20,000 records per side and 50 compared fields**, with changed membership, shuffled order and one modified field. Expected counts are one added, one removed, one changed and 19,998 unchanged. The streamed report contains **20,001 data records** plus its header. See `large-batch.json` for the recorded timing and size; those measurements describe this machine and synthetic fixture, not performance guarantees for arbitrary workbooks or phones.

## Visual and offline review

Desktop (1440 pixels), mobile (412 pixels) and narrow mobile (320 pixels, Chinese) screenshots were generated, checked for document overflow and visible button bounds, and visually inspected. Narrow mapping rows stack their Before/After controls. Sample report and problem views are captured under this directory. Offline checks retain the existing same-origin/no-network CSP.

Artifacts:

- `browser-results.json`: focused cross-engine result metadata.
- `large-batch.json`: measured comparison capacity.
- `results-1440.png`, `results-412.png`, `results-320.png`: compact comparison screens.
- `automatic-1440.png`: zero-configuration matching.
- `review-1440.png`, `review-320.png`, `xlsx-samples-320.png`: one-confirmation XLSX review and results.
- `blocked-1440.png`: duplicate/empty-ID diagnostics.
- `offline-webkit.png`: comparison after stopping its local server.
- `sample-report.xlsx`: locally generated fictional inventory report (ignored by the existing repository spreadsheet-file rules).

## Practical limits

Comparison supports CSV/XLSX, one worksheet per version, one unique ID, 20,000 nonblank rows per side, and 50 fields besides the ID. The existing 50 MB input limit and XLSX decompression limits still apply. Memory remains device/input dependent. No Firefox run is claimed.

Comparison state is temporary in this tab; workspace switching retains it but refresh/close clears it. It is not included in merge backups. Reports contain every matched/unmatched record, selected mappings/options, original values and excluded column names. Only selected fields affect status. Native dates/times use ISO values and display formatting is ignored; formulas are not recalculated. No fuzzy/composite-key matching, numeric tolerances, cloud processing or business interpretation is provided.
