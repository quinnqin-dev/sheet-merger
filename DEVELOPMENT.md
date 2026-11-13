# Development

This guide is for contributors and maintainers. End users should open the hosted app at <https://sheet-merger-80c7.onrender.com/>.

## Architecture

The active application is a static React and TypeScript frontend built with Vite. Spreadsheet parsing, conversion, merging, and export run in a browser Web Worker. Templates, rules, uploaded files, processing rows, and the current workspace are stored in the browser's IndexedDB for the current site origin.

The frontend makes no API requests. Render serves the production files from `frontend/dist` through its CDN. The `backend/` directory contains the earlier FastAPI implementation, retained for compatibility checks and local reference; the browser app and Render deployment do not use it.

## Local setup

Install Node.js 22.18+ with npm, then run from the repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Vite serves the development app at <http://127.0.0.1:5173>.

On macOS, `./setup.sh` installs frontend dependencies and creates a production build. `./start.command` serves that build locally at <http://127.0.0.1:4173> and opens it in the browser.

## Render deployment

The root `render.yaml` defines one Render static site:

| Setting | Value |
| --- | --- |
| Runtime | Static |
| Build command | `npm --prefix frontend ci && npm --prefix frontend run build` |
| Publish directory | `frontend/dist` |

The Blueprint does not require Python, a start command, a persistent disk, a database, or environment variables. Changes pushed to `main` are deployed through the connected Render Blueprint.

Templates and rules are stored per browser and site origin. The default Render domain and a future custom domain therefore use separate browser data; export the rule library before changing domains when data needs to be migrated.

## Checks

Run from the repository root:

```sh
npm --prefix frontend run build
npm --prefix frontend run format:check
npm --prefix frontend test
npm --prefix frontend run test:browser -- --project=chromium
```

Install the Playwright Chromium browser first if needed:

```sh
npm --prefix frontend exec playwright install chromium
```

The full browser suite covers offline processing after initial page load, downloads, refresh and tab restoration, template JSON fallback, 100,000-row processing, and the single-workspace tab lock.

When changing the retained Python backend, also run:

```sh
.venv/bin/python -m pytest -q -s
```

Shared English and Chinese messages live in `shared/locales/`. Keep message keys and interpolation placeholders consistent between both catalogs. See `VALIDATION.md` for test coverage and practical limitations.

## License

This project is released under the MIT License. See `LICENSE` for the full text.

## Keyed version comparison (v1.1)

`CompareWorkspace.tsx` is a lazy workspace with a separate `compare.worker.ts`. Its in-memory service owns parsed books, selected worksheets and the latest result; the UI receives metadata and 25-record pages. Switching workspaces retains the mounted comparison. Reload clears it; compare state does not change IndexedDB or merge backups. The service invalidates its result before loading/selecting/running, so failed changes cannot export a stale report.

`compare.ts` validates unique mappings and selected values, indexes rows by an explicitly chosen key, and performs exact text comparison unless trim/case options are enabled. Limits are 20,000 nonblank rows per side and 50 fields besides the ID. The shared reader adds optional delimiter and timestamp preservation arguments; merge defaults are unchanged. `compare-export.ts` streams three worksheets into XLSX with inline text cells, literal Excel escape-like strings and source provenance. Report strings cannot become formulas.

Run `npm --prefix frontend test` for comparison and existing unit coverage. Run the normal Chromium suite for full regression coverage, or `cd frontend` followed by `npx playwright test --config=playwright.compare.config.ts --project=chromium` for the focused comparison suite. Existing installed WebKit can run the same focused suite, with its offline-simulation and scale skips explicitly recorded. Artifacts and measured capacity are under `docs/verification/compare/`.

### Automatic matching (v1.1.1)

`compare-plan.ts` runs inside the comparison worker. It matches normalized equal headers, recognizes a bounded set of ID-like names, and proposes known synonyms only for review. Multiple possible identifiers, unknown/renamed fields and disjoint ID sets require explicit confirmation. With clear matching, the existing comparison engine runs automatically and retains its duplicate/empty-ID blockers. The planner does not treat uniqueness alone as proof that a descriptive column is an ID. Multiple-sheet files require a worksheet confirmation before planning.

The UI applies the plan once per pair of selected input snapshots, keeps complete controls in Advanced matching settings and sends explicit user edits through the same validated engine. Results show concise changed values first, with all selected values still available in details and exports.
