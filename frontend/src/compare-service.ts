import { planComparison } from "./compare-plan.ts";
import { readBook, type InputBook } from "./engine.ts";
import { LocalizedError, type Locale } from "./i18n-core.ts";
import {
  tableFromBook,
  inputSummary,
  compareTables,
  resultPage,
  type Side,
  type CompareTable,
  type CompareResult,
  type CompareFilter,
  type CompareOptions,
} from "./compare.ts";

export function createCompareService() {
  const books: Partial<Record<Side, { book: InputBook; file: string }>> = {};
  const tables: Partial<Record<Side, CompareTable>> = {};
  let result: Extract<CompareResult, { ok: true }> | undefined;
  return {
    async load({
      side,
      file,
      encoding,
      delimiter = "",
    }: {
      side: Side;
      file: File;
      encoding: string;
      delimiter?: string;
    }) {
      result = undefined;
      delete books[side];
      delete tables[side];
      if (!/\.(csv|xlsx)$/i.test(file.name))
        throw new LocalizedError("compare.fileType");
      const book = await readBook(file, encoding, delimiter, true);
      books[side] = { book, file: file.name };
      return { names: book.names };
    },
    async select({
      side,
      sheet,
      headerRow,
    }: {
      side: Side;
      sheet: string;
      headerRow: number;
    }) {
      result = undefined;
      delete tables[side];
      const source = books[side];
      if (!source) throw new LocalizedError("compare.needFiles");
      const table = await tableFromBook(
        source.book,
        source.file,
        sheet,
        headerRow,
      );
      tables[side] = table;
      return inputSummary(table);
    },
    async plan(matching: Pick<CompareOptions, "trim" | "ignoreCase">) {
      if (!tables.before || !tables.after)
        throw new LocalizedError("compare.needFiles");
      return planComparison(tables.before, tables.after, matching);
    },
    async run(options: CompareOptions) {
      result = undefined;
      if (!tables.before || !tables.after)
        throw new LocalizedError("compare.needFiles");
      const outcome = compareTables(tables.before, tables.after, options);
      if (!outcome.ok) return outcome;
      result = outcome;
      return { ok: true as const, summary: result.summary };
    },
    async page({
      filter,
      query,
      page,
    }: {
      filter: CompareFilter;
      query: string;
      page: number;
    }) {
      if (!result) throw new LocalizedError("compare.noResult");
      return resultPage(result.rows, filter, query, page);
    },
    async export({ locale }: { locale: Locale }) {
      if (!result) throw new LocalizedError("compare.noResult");
      const { exportComparison } = await import("./compare-export.ts");
      return exportComparison(result, locale);
    },
  };
}
export type CompareOperations = ReturnType<typeof createCompareService>;
