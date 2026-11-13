import { normal } from "./casefold.ts";
import type { CompareTable, CompareOptions, ColumnPair } from "./compare.ts";
export type SuggestedMapping = {
  before: number;
  after: number | null;
  enabled: boolean;
};
export type ComparePlan = {
  mappings: SuggestedMapping[];
  keyBefore: number | null;
  candidates: number[];
  reviewFields: number[];
  reason: "ready" | "fields" | "key" | "overlap" | "limit";
  options: CompareOptions | null;
};
const compact = (header: string) => normal(header).replace(/[\s_\-./]+/g, "");
const isIdentifier = (header: string) =>
  /^(id|sku|uuid|编号|编码|学号|订单号|货号|商品编码|商品编号|客户编号|记录编号|学生编号|订单编号|员工编号|recordid|rowid|(student|customer|order|product|employee|item|record|account|user|invoice|transaction|line)(id|code|number|no))$/.test(
    compact(header),
  );
// Renames are suggestions for review, never silently accepted mappings.
const families = [
  ["stock", "quantity", "qty", "库存", "数量"],
  ["score", "points", "成绩", "分数"],
  ["sku", "productcode", "itemcode", "商品编码", "货号"],
  ["studentid", "学号", "学生编号"],
  ["orderid", "ordernumber", "orderno", "订单号", "订单编号"],
];
export function planComparison(
  before: CompareTable,
  after: CompareTable,
  matching: Pick<CompareOptions, "trim" | "ignoreCase">,
): ComparePlan {
  const mappings: SuggestedMapping[] = before.headers.map((name, index) => {
    const other = after.headers.findIndex(
      (header) => normal(header) === normal(name),
    );
    return {
      before: index,
      after: other < 0 ? null : other,
      enabled: other >= 0,
    };
  });
  const reviewFields = mappings
    .filter((pair) => pair.after === null)
    .map((pair) => pair.before);
  const used = new Set(
    mappings.flatMap((pair) => (pair.after === null ? [] : [pair.after])),
  );
  const proposals = new Map<number, number[]>();
  for (const index of reviewFields) {
    const name = compact(before.headers[index]);
    const family = families.find((group) => group.includes(name));
    const matches = family
      ? after.headers.flatMap((header, candidate) =>
          !used.has(candidate) && family.includes(compact(header))
            ? [candidate]
            : [],
        )
      : [];
    proposals.set(index, matches);
  }
  for (const index of reviewFields) {
    const matches = proposals.get(index)!;
    if (
      matches.length === 1 &&
      [...proposals.values()].filter((candidates) =>
        candidates.includes(matches[0]),
      ).length === 1
    ) {
      mappings[index].after = matches[0];
      mappings[index].enabled = true;
    }
  }
  const candidates = mappings
    .filter(
      (pair) =>
        pair.after !== null &&
        isIdentifier(before.headers[pair.before]) &&
        isIdentifier(after.headers[pair.after!]),
    )
    .map((pair) => pair.before);
  const keyBefore = candidates.length === 1 ? candidates[0] : null;
  const key = keyBefore === null ? null : mappings[keyBefore];
  const columns: ColumnPair[] = mappings
    .filter(
      (pair) =>
        pair.enabled && pair.before !== keyBefore && pair.after !== null,
    )
    .map((pair) => ({ before: pair.before, after: pair.after! }));
  const options: CompareOptions | null =
    key && columns.length
      ? { key: { before: key.before, after: key.after! }, columns, ...matching }
      : null;
  let reason: ComparePlan["reason"] =
    keyBefore === null
      ? "key"
      : reviewFields.length
        ? "fields"
        : columns.length > 50 || !columns.length
          ? "limit"
          : "ready";
  if (reason === "ready" && key) {
    const normalize = (value: string) => {
      const text = matching.trim ? value.trim() : value;
      return matching.ignoreCase ? text.toLowerCase() : text;
    };
    const left = new Set(
      before.rows.map((row) => normalize(row.values[key.before])),
    );
    const hasOverlap = after.rows.some((row) =>
      left.has(normalize(row.values[key.after!])),
    );
    // A missing/duplicate ID is reported by the engine. Zero overlap needs a
    // human confirmation before treating every record as added or removed.
    if (!hasOverlap && before.rows.length && after.rows.length)
      reason = "overlap";
    if (!before.rows.length && !after.rows.length) reason = "overlap";
  }
  return { mappings, keyBefore, candidates, reviewFields, reason, options };
}
