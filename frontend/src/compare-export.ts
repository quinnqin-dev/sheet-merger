import { Zip, ZipDeflate, strToU8 } from "fflate";
import { translate, type Locale } from "./i18n-core.ts";
import type { CompareResult } from "./compare.ts";
const escapeXML = (value: unknown) =>
  String(value ?? "")
    .replace(/_x[0-9a-f]{4}_/gi, (match) => "_x005F_" + match.slice(1))
    .replace(
      /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,
      (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
    )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;");
function letter(index: number): string {
  let value = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    value = String.fromCharCode(65 + ((n - 1) % 26)) + value;
  return value;
}
// Inline strings preserve IDs, exact source text and formula-looking values.
// Stream worksheet XML into the ZIP to avoid retaining an entire report XML.
export async function exportComparison(
  result: Extract<CompareResult, { ok: true }>,
  locale: Locale,
) {
  const t = (key: string) => translate(key, {}, locale);
  const chunks: Uint8Array[] = [];
  let failure: Error | undefined;
  const zip = new Zip((error, bytes) => {
    if (error) failure = error;
    else chunks.push(new Uint8Array(bytes));
  });
  const part = (name: string, text: string) => {
    const entry = new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    entry.push(strToU8(text), true);
  };
  const sheets = ["Summary", "Columns", "Comparison"];
  part(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      "</Types>",
  );
  part(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  part(
    "xl/workbook.xml",
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets
        .map(
          (name, i) =>
            `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join("") +
      "</sheets></workbook>",
  );
  part(
    "xl/_rels/workbook.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  part(
    "xl/styles.xml",
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4F1E8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );
  async function worksheet(
    index: number,
    headers: string[],
    data: Iterable<{ values: unknown[]; highlight?: Set<number> }>,
  ) {
    const entry = new ZipDeflate(`xl/worksheets/sheet${index}.xml`, {
      level: 6,
    });
    zip.add(entry);
    entry.push(
      strToU8(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
          headers
            .map(
              (_, column) =>
                `<col min="${column + 1}" max="${column + 1}" width="${index === 1 ? (column === 0 ? 36 : 100) : index === 2 ? 32 : column === 0 ? 16 : column < 3 ? 24 : column < 5 ? 18 : 26}" customWidth="1"/>`,
            )
            .join("") +
          "</cols><sheetData>",
      ),
      false,
    );
    let n = 0,
      lines: string[] = [];
    const append = (
      values: unknown[],
      style: number,
      highlight?: Set<number>,
    ) => {
      n++;
      lines.push(
        `<row r="${n}">` +
          values
            .map(
              (value, column) =>
                `<c r="${letter(column)}${n}" s="${highlight?.has(column) ? 2 : style}" t="inlineStr"><is><t xml:space="preserve">${escapeXML(value)}</t></is></c>`,
            )
            .join("") +
          "</row>",
      );
    };
    append(headers, 1);
    for (const row of data) {
      append(row.values, 0, row.highlight);
      if (lines.length >= 250) {
        entry.push(strToU8(lines.join("")), false);
        lines = [];
        if (failure) throw failure;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    entry.push(
      strToU8(
        lines.join("") +
          `</sheetData><autoFilter ref="A1:${letter(headers.length - 1)}${n}"/></worksheet>`,
      ),
      true,
    );
  }
  const { summary } = result,
    { before, after, options, counts } = summary;
  const pairs = [options.key, ...options.columns];
  const summaryRows: unknown[][] = [
    [t("compare.created"), new Date().toISOString()],
    ...(["before", "after"] as const).flatMap((side) => {
      const input = summary[side];
      return [
        [t(`compare.${side}`), input.file],
        [t(`compare.${side}`) + " / " + t("compare.sheet"), input.sheet],
        [
          t(`compare.${side}`) + " / " + t("compare.headerRow"),
          input.headerRow,
        ],
        [t(`compare.${side}`) + " / " + t("compare.rows"), input.rowCount],
        [
          t(`compare.${side}`) + " / " + t("compare.blankRows"),
          input.blankRows,
        ],
      ];
    }),
    ...Object.entries(counts).map(([status, count]) => [
      t(`compare.${status}`),
      count,
    ]),
    [
      t("compare.key"),
      `${before.headers[options.key.before]} → ${after.headers[options.key.after]}`,
    ],
    [t("compare.trim"), t(options.trim ? "compare.yes" : "compare.no")],
    [
      t("compare.ignoreCase"),
      t(options.ignoreCase ? "compare.yes" : "compare.no"),
    ],
    [t("compare.semantics"), t("compare.exactHint")],
    [t("compare.scope"), t("compare.reportScope")],
  ];
  await worksheet(
    1,
    [t("compare.setting"), t("compare.value")],
    summaryRows.map((values) => ({ values })),
  );
  const columns = pairs.map((pair, i) => ({
    values: [
      before.headers[pair.before],
      after.headers[pair.after],
      t(i ? "compare.compared" : "compare.key"),
    ],
  }));
  for (const side of ["before", "after"] as const)
    for (const name of summary.uncompared[side])
      columns.push({
        values: [
          side === "before" ? name : "",
          side === "after" ? name : "",
          t("compare.uncompared"),
        ],
      });
  await worksheet(
    2,
    [t("compare.before"), t("compare.after"), t("compare.purpose")],
    columns,
  );
  function* records() {
    for (const row of result.rows) {
      const highlight = new Set(
        row.changed.flatMap((i) => [5 + i * 2, 6 + i * 2]),
      );
      yield {
        values: [
          t(`compare.${row.status}`),
          row.beforeKey,
          row.afterKey,
          row.beforeRow,
          row.afterRow,
          ...options.columns.flatMap((_, i) => [
            row.before?.[i] ?? "",
            row.after?.[i] ?? "",
          ]),
        ],
        highlight,
      };
    }
  }
  await worksheet(
    3,
    [
      t("compare.status"),
      t("compare.before") + " / " + t("compare.key"),
      t("compare.after") + " / " + t("compare.key"),
      t("compare.beforeRow"),
      t("compare.afterRow"),
      ...options.columns.flatMap((pair) => [
        t("compare.before") + " / " + before.headers[pair.before],
        t("compare.after") + " / " + after.headers[pair.after],
      ]),
    ],
    records(),
  );
  zip.end();
  if (failure) throw failure;
  return new Blob(chunks, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
