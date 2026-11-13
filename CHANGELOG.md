# Changelog

## 1.1.1 — 2026-11-14

### Compare spreadsheet versions

- Add Compare versions for two CSV/XLSX exports, with added, removed, changed and unchanged record counts.
- Match equal column names and a recognizable record ID automatically; matching files show results as soon as both files are selected.
- Ask for confirmation when IDs, renamed fields, disjoint records or worksheets need a choice. Unknown fields require mapping or explicit exclusion.
- Show concise field changes first, with full selected values available on demand. Keep import and advanced matching settings collapsed.
- Block empty or duplicate IDs, selected formulas without saved results, and values that cannot be exported safely.
- Export Summary, Columns and Comparison worksheets containing all records, original values, source rows, matching settings and excluded fields.
- Support optional whitespace/case matching, CSV encoding/separator controls, status filters, ID search and pagination.
- Keep English/Chinese support, local browser processing and offline use. Comparison data remains temporary in the current tab; existing merge persistence and backups continue separately.

Comparison limits: 20,000 nonblank records per side, 50 compared fields plus one unique ID, one worksheet per side, and the existing 50 MB per-file limit. No composite keys, fuzzy matching, numerical tolerances or formula recalculation.

See [verification](docs/verification/compare/REPORT.md) and [usage](README.md#compare-versions).
