import { blank, wire, type InputBook } from "./engine.ts";
import { LocalizedError } from "./i18n-core.ts";

export const COMPARE_ROW_LIMIT = 20000;
export const COMPARE_COLUMN_LIMIT = 50;
export type Side = "before" | "after";
export type CompareRow = { row: number; values: string[]; missing: number[] };
export type CompareTable = {
  file: string;
  sheet: string;
  headerRow: number;
  headers: string[];
  rows: CompareRow[];
  blankRows: number;
};
export type CompareInput = Omit<CompareTable, "rows"> & {
  rowCount: number;
  sample: CompareRow[];
};
export type ColumnPair = { before: number; after: number };
export type CompareOptions = {
  key: ColumnPair;
  columns: ColumnPair[];
  trim: boolean;
  ignoreCase: boolean;
};
export type CompareStatus = "added" | "removed" | "changed" | "unchanged";
export type CompareFilter = CompareStatus | "differences" | "all";
export type KeyIssue = {
  side: Side;
  row: number;
  key: string;
  code:
    | "compare.emptyKey"
    | "compare.duplicateKey"
    | "compare.formula"
    | "compare.textLimit"
    | "compare.textControl";
  column?: string;
};
export type DiffRow = {
  status: CompareStatus;
  key: string;
  beforeKey: string | null;
  afterKey: string | null;
  beforeRow: number | null;
  afterRow: number | null;
  before: string[] | null;
  after: string[] | null;
  changed: number[];
};
export type CompareSummary = {
  counts: Record<CompareStatus, number>;
  before: CompareInput;
  after: CompareInput;
  options: CompareOptions;
  uncompared: Record<Side, string[]>;
};
export type CompareResult =
  | {
      ok: true;
      summary: CompareSummary;
      rows: DiffRow[];
    }
  | { ok: false; issues: KeyIssue[]; issueCount: number };

export async function tableFromBook(
  book: InputBook,
  file: string,
  sheet: string,
  headerRow: number,
): Promise<CompareTable> {
  if (!book.names.includes(sheet)) throw new LocalizedError("sheet_unreadable");
  const { inspectSheet } = await import("./reader.ts");
  const info = inspectSheet(book, sheet, headerRow);
  if (info.row_count > COMPARE_ROW_LIMIT)
    throw new LocalizedError("compare.rowLimit", { limit: COMPARE_ROW_LIMIT });
  if (
    info.headers.some(
      (header) =>
        header.length > 32767 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(header),
    )
  )
    throw new LocalizedError("compare.headerTextLimit");
  const rows: CompareRow[] = [];
  for (const row of book.rows(sheet)) {
    if (row.row <= headerRow || blank(row.raw)) continue;
    if (!blank(row.raw.slice(info.headers.length)))
      throw new LocalizedError("compare.extraCells", { row: row.row });
    rows.push({
      row: row.row,
      values: info.headers.map((_, i) =>
        row.values[i] instanceof Date
          ? (row.values[i] as Date)
              .toISOString()
              .replace(/T00:00:00\.000Z$/, "")
          : String(wire(row.values[i]) ?? ""),
      ),
      missing: [...row.missing],
    });
  }
  return {
    file,
    sheet,
    headerRow,
    headers: info.headers,
    rows,
    blankRows: info.blank_count,
  };
}
export function inputSummary(table: CompareTable): CompareInput {
  const { rows, ...info } = table;
  return { ...info, rowCount: rows.length, sample: rows.slice(0, 3) };
}
const normalize = (value: string, options: CompareOptions) => {
  const text = options.trim ? value.trim() : value;
  return options.ignoreCase ? text.toLowerCase() : text;
};
export function compareTables(
  before: CompareTable,
  after: CompareTable,
  options: CompareOptions,
): CompareResult {
  if (
    before.rows.length > COMPARE_ROW_LIMIT ||
    after.rows.length > COMPARE_ROW_LIMIT
  )
    throw new LocalizedError("compare.rowLimit", { limit: COMPARE_ROW_LIMIT });
  if (!options.columns.length) throw new LocalizedError("compare.noColumns");
  if (options.columns.length > COMPARE_COLUMN_LIMIT)
    throw new LocalizedError("compare.columnLimit", {
      limit: COMPARE_COLUMN_LIMIT,
    });
  const pairs = [options.key, ...options.columns];
  for (const side of ["before", "after"] as const) {
    const indices = pairs.map((pair) => pair[side]);
    if (
      indices.some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= (side === "before" ? before : after).headers.length,
      ) ||
      new Set(indices).size !== indices.length
    )
      throw new LocalizedError("compare.mappingError");
  }
  const issues: KeyIssue[] = [];
  let issueCount = 0;
  const issue = (value: KeyIssue) => {
    issueCount++;
    if (issues.length < 200) issues.push(value);
  };
  function index(table: CompareTable, side: Side) {
    const byKey = new Map<string, CompareRow>();
    const duplicated = new Set<string>();
    for (const row of table.rows) {
      const key = row.values[options.key[side]];
      const missing = pairs.find((pair) => row.missing.includes(pair[side]));
      if (missing) {
        issue({
          side,
          row: row.row,
          key,
          code: "compare.formula",
          column: table.headers[missing[side]],
        });
        continue;
      }
      const invalidText = pairs.find(
        (pair) =>
          row.values[pair[side]].length > 32767 ||
          /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(
            row.values[pair[side]],
          ),
      );
      if (invalidText) {
        issue({
          side,
          row: row.row,
          key: key.slice(0, 200),
          code:
            row.values[invalidText[side]].length > 32767
              ? "compare.textLimit"
              : "compare.textControl",
          column: table.headers[invalidText[side]],
        });
        continue;
      }
      const normalized = normalize(key, options);
      if (!normalized.trim()) {
        issue({ side, row: row.row, key, code: "compare.emptyKey" });
        continue;
      }
      const previous = byKey.get(normalized);
      if (previous) {
        if (!duplicated.has(normalized)) {
          issue({
            side,
            row: previous.row,
            key: previous.values[options.key[side]],
            code: "compare.duplicateKey",
          });
          duplicated.add(normalized);
        }
        issue({ side, row: row.row, key, code: "compare.duplicateKey" });
      } else byKey.set(normalized, row);
    }
    return byKey;
  }
  const old = index(before, "before"),
    next = index(after, "after");
  if (issueCount) return { ok: false, issues, issueCount };
  const rows: DiffRow[] = [];
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  function add(b?: CompareRow, a?: CompareRow) {
    const left = b
      ? options.columns.map((pair) => b.values[pair.before])
      : null;
    const right = a
      ? options.columns.map((pair) => a.values[pair.after])
      : null;
    const changed = options.columns.flatMap((_, i) =>
      !left ||
      !right ||
      normalize(left[i], options) !== normalize(right[i], options)
        ? [i]
        : [],
    );
    const status = !b
      ? "added"
      : !a
        ? "removed"
        : changed.length
          ? "changed"
          : "unchanged";
    counts[status]++;
    rows.push({
      status,
      key: b ? b.values[options.key.before] : a!.values[options.key.after],
      beforeKey: b?.values[options.key.before] ?? null,
      afterKey: a?.values[options.key.after] ?? null,
      beforeRow: b?.row ?? null,
      afterRow: a?.row ?? null,
      before: left,
      after: right,
      changed,
    });
  }
  for (const [key, row] of old) add(row, next.get(key));
  for (const [key, row] of next) if (!old.has(key)) add(undefined, row);
  return {
    ok: true,
    rows,
    summary: {
      counts,
      before: inputSummary(before),
      after: inputSummary(after),
      options: structuredClone(options),
      uncompared: {
        before: before.headers.filter(
          (_, index) => !pairs.some((pair) => pair.before === index),
        ),
        after: after.headers.filter(
          (_, index) => !pairs.some((pair) => pair.after === index),
        ),
      },
    },
  };
}
export function resultPage(
  rows: DiffRow[],
  filter: CompareFilter,
  query: string,
  page: number,
) {
  const search = query.toLowerCase();
  const matched = rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "differences"
          ? row.status !== "unchanged"
          : row.status === filter)) &&
      (!search ||
        [row.beforeKey, row.afterKey].some((key) =>
          key?.toLowerCase().includes(search),
        )),
  );
  const total = matched.length;
  const current = Math.max(
    1,
    Math.min(Math.ceil(total / 25) || 1, Math.floor(page) || 1),
  );
  return {
    rows: matched.slice((current - 1) * 25, current * 25),
    total,
    page: current,
  };
}
