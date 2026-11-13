import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  useI18n,
  LocalizedError,
  msg,
  type Message,
  renderMessage,
} from "./i18n";
import type { ComparePlan, SuggestedMapping } from "./compare-plan";
import { downloadBlob } from "./local-client";
import { createCompareClient } from "./compare-client";
import type {
  Side,
  CompareInput,
  CompareOptions,
  CompareSummary,
  CompareFilter,
  KeyIssue,
  DiffRow,
} from "./compare";
import "./compare.css";
type Input = {
  file: File;
  names: string[];
  sheet: string;
  headerRow: string;
  encoding: string;
  delimiter: string;
  data?: CompareInput;
  confirmedSheet: boolean;
};
type Mapping = SuggestedMapping;
export function CompareWorkspace({
  onBusyChange,
}: {
  onBusyChange: (value: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [inputs, setInputs] = useState<Partial<Record<Side, Input>>>({});
  const [mapping, setMapping] = useState<Mapping[]>([]);
  const [keyIndex, setKeyIndex] = useState("");
  const [plan, setPlan] = useState<ComparePlan | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [manual, setManual] = useState(false);
  const planned = useRef<{ before: CompareInput; after: CompareInput } | null>(
    null,
  );
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const [trim, setTrim] = useState(false),
    [ignoreCase, setIgnoreCase] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<Message | null>(null);
  const [summary, setSummary] = useState<CompareSummary | null>(null);
  const [issues, setIssues] = useState<{
    items: KeyIssue[];
    count: number;
  } | null>(null);
  const [filter, setFilter] = useState<CompareFilter>("differences"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const [records, setRecords] = useState<{
    rows: DiffRow[];
    total: number;
    page: number;
  }>({ rows: [], total: 0, page: 1 });
  const [loadingRows, setLoadingRows] = useState(false);
  const client = useRef<ReturnType<typeof createCompareClient> | null>(null);
  const inFlight = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const getClient = () => (client.current ??= createCompareClient());
  useEffect(
    () => () => {
      client.current?.dispose();
    },
    [],
  );
  const before = inputs.before?.data,
    after = inputs.after?.data;
  function invalidate() {
    setSummary(null);
    setIssues(null);
    setRecords({ rows: [], total: 0, page: 1 });
    setError(null);
  }
  useEffect(() => {
    if (
      !before ||
      !after ||
      !inputs.before?.confirmedSheet ||
      !inputs.after?.confirmedSheet
    ) {
      planned.current = null;
      setPlan(null);
      setKeyIndex("");
      setMapping([]);
      return;
    }
    if (
      busy ||
      inFlight.current ||
      (planned.current?.before === before && planned.current?.after === after)
    )
      return;
    const token = { before, after };
    planned.current = token;
    void action(async () => {
      const next = await getClient().call("plan", { trim, ignoreCase });
      if (planned.current !== token) return;
      setExcluded([]);
      setPlan(next);
      setMapping(next.mappings);
      setKeyIndex(next.keyBefore === null ? "" : String(next.keyBefore));
      setManual(false);
      setAdvanced(false);
      if (next.reason === "ready" && next.options)
        await executeComparison(next.options);
    });
  }, [
    before,
    after,
    busy,
    inputs.before?.confirmedSheet,
    inputs.after?.confirmedSheet,
  ]);
  useEffect(() => {
    if (!summary) return;
    let current = true;
    setLoadingRows(true);
    const timer = setTimeout(() => {
      void getClient()
        .call("page", { filter, query, page })
        .then((result) => {
          if (current) setRecords(result);
        })
        .catch((e) => {
          if (current)
            setError(
              e instanceof LocalizedError
                ? msg(e.code, e.params)
                : msg("compare.failed"),
            );
        })
        .finally(() => {
          if (current) setLoadingRows(false);
        });
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [summary, filter, query, page]);
  useEffect(() => {
    if (summary || issues) resultHeading.current?.focus();
  }, [summary, issues]);
  async function action(run: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(
        e instanceof LocalizedError
          ? msg(e.code, e.params)
          : msg("compare.failed"),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function load(
    side: Side,
    file: File,
    encoding = "utf-8-sig",
    delimiter = "",
  ) {
    invalidate();
    const input: Input = {
      file,
      names: [],
      sheet: "",
      headerRow: "1",
      encoding,
      delimiter,
      confirmedSheet: false,
    };
    setInputs((old) => ({ ...old, [side]: input }));
    const { names } = await getClient().call("load", {
      side,
      file,
      encoding,
      delimiter,
    });
    input.names = names;
    input.sheet = names[0] ?? "";
    input.confirmedSheet = names.length === 1;
    setInputs((old) => ({ ...old, [side]: { ...input } }));
    const data = await getClient().call("select", {
      side,
      sheet: input.sheet,
      headerRow: 1,
    });
    setInputs((old) => ({ ...old, [side]: { ...input, data } }));
  }
  function editSelection(
    side: Side,
    patch: Partial<Pick<Input, "sheet" | "headerRow">>,
  ) {
    invalidate();
    setInputs((old) => ({
      ...old,
      [side]: {
        ...old[side]!,
        ...patch,
        data: undefined,
        confirmedSheet: false,
      },
    }));
  }
  async function readSelection(side: Side) {
    const input = inputs[side]!;
    invalidate();
    const data = await getClient().call("select", {
      side,
      sheet: input.sheet,
      headerRow: Number(input.headerRow),
    });
    setInputs((old) => ({
      ...old,
      [side]: { ...input, data, confirmedSheet: true },
    }));
  }
  const selectedKey =
    keyIndex === ""
      ? null
      : mapping.find((pair) => pair.before === Number(keyIndex));
  const selected = mapping.filter(
    (pair) => pair.enabled && pair.before !== selectedKey?.before,
  );
  const pairs = selectedKey ? [selectedKey, ...selected] : [];
  const validMapping =
    !!before &&
    !!after &&
    !!selectedKey &&
    !!selected.length &&
    selected.length <= 50 &&
    pairs.every((pair) => pair.after !== null) &&
    new Set(pairs.map((pair) => pair.after)).size === pairs.length;
  function updateMapping(index: number, patch: Partial<Mapping>) {
    invalidate();
    setManual(true);
    if (patch.enabled === false)
      setExcluded((old) => [...new Set([...old, index])]);
    setMapping((old) =>
      old.map((pair) => (pair.before === index ? { ...pair, ...patch } : pair)),
    );
  }
  async function compare() {
    if (!validMapping || !selectedKey)
      throw new LocalizedError("compare.mappingError");
    invalidate();
    const options: CompareOptions = {
      key: { before: selectedKey.before, after: selectedKey.after! },
      columns: selected.map((pair) => ({
        before: pair.before,
        after: pair.after!,
      })),
      trim,
      ignoreCase,
    };
    await executeComparison(options);
  }
  async function executeComparison(options: CompareOptions) {
    invalidate();
    setManual(false);
    const result = await getClient().call("run", options);
    setFilter("differences");
    setQuery("");
    setPage(1);
    if (result.ok) setSummary(result.summary);
    else setIssues({ items: result.issues, count: result.issueCount });
  }
  async function sample() {
    await load(
      "before",
      new File(
        [
          "SKU,Product,Stock,Warehouse\n0001,Notebook,20,West\n0002,Pen,50,West\n0003,Mug,8,East\n",
        ],
        "inventory-before.csv",
      ),
    );
    await load(
      "after",
      new File(
        [
          "Product,SKU,Quantity,Warehouse,Updated by\nPen,0002,50,West,Alex\nNotebook,0001,25,West,Alex\nBottle,0004,12,East,Alex\n",
        ],
        "inventory-after.csv",
      ),
    );
  }
  function clear() {
    if (!window.confirm(t("compare.clearConfirm"))) return;
    client.current?.dispose();
    client.current = null;
    invalidate();
    setInputs({});
    setMapping([]);
    setKeyIndex("");
    setTrim(false);
    setIgnoreCase(false);
    setQuery("");
    setFilter("differences");
    setPage(1);
    setPlan(null);
    setExcluded([]);
    setAdvanced(false);
    setManual(false);
    planned.current = null;
  }
  function openAdvanced() {
    setAdvanced(true);
    requestAnimationFrame(() =>
      advancedRef.current?.scrollIntoView({ block: "start" }),
    );
  }
  const value = (text: string | null | undefined, absent = false) =>
    absent
      ? t("compare.notPresent")
      : text === ""
        ? t("compare.empty")
        : (text ?? "");
  return (
    <section className="compare-workspace" aria-label={t("compare.nav")}>
      <div className="page-heading compare-heading">
        <div>
          <div className="eyebrow">{t("compare.eyebrow")}</div>
          <h1>{t("compare.title")}</h1>
          <p>{t("compare.intro")}</p>
        </div>
        <div className="button-group">
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void action(sample)}
          >
            <Sparkles size={16} />
            {t("compare.sample")}
          </button>
          {(inputs.before || inputs.after) && (
            <button className="btn subtle" disabled={busy} onClick={clear}>
              <RotateCcw size={16} />
              {t("compare.clear")}
            </button>
          )}
        </div>
      </div>
      <div className="compare-privacy">
        <ShieldCheck size={18} />
        <div>
          <strong>{t("compare.limits")}</strong>
          <p>{t("compare.temporary")}</p>
        </div>
      </div>
      {error && (
        <div role="alert" className="alert error">
          <span>{renderMessage(error)}</span>
        </div>
      )}
      {busy && (
        <p className="compare-working" role="status">
          <LoaderCircle className="compare-spinner" size={18} />
          {t("compare.working")}
        </p>
      )}
      <div className="compare-inputs">
        {(["before", "after"] as const).map((side, i) => {
          const input = inputs[side];
          return (
            <fieldset
              key={side}
              className="compare-source panel"
              disabled={busy}
            >
              <legend>
                <span className="compare-number">0{i + 1}</span>{" "}
                {t(`compare.${side}`)}
              </legend>
              <p>{t("compare.chooseHint")}</p>
              <label className="compare-file">
                <FileSpreadsheet size={22} />
                <span>{input?.file.name || t(`compare.${side}`)}</span>
                <span className="compare-file-choose">
                  {t("compare.chooseFile")}
                </span>
                <input
                  className="compare-file-input"
                  type="file"
                  accept=".csv,.xlsx"
                  aria-label={t("compare.file", { side: t(`compare.${side}`) })}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void action(() => load(side, file));
                  }}
                />
              </label>
              {input && (
                <>
                  <details
                    className="compare-import-options"
                    open={!input.data || !input.confirmedSheet}
                  >
                    <summary>{t("compare.importOptions")}</summary>
                    {input.names.length > 1 && !input.confirmedSheet && (
                      <p className="compare-sheet-prompt">
                        {t("compare.confirmSheet")}
                      </p>
                    )}
                    <div className="compare-source-controls">
                      <label>
                        {t("compare.sheet")}
                        <select
                          aria-label={`${t(`compare.${side}`)} / ${t("compare.sheet")}`}
                          value={input.sheet}
                          onChange={(e) =>
                            editSelection(side, { sheet: e.target.value })
                          }
                        >
                          {input.names.map((name) => (
                            <option key={name}>{name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("compare.headerRow")}
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          aria-label={`${t(`compare.${side}`)} / ${t("compare.headerRow")}`}
                          value={input.headerRow}
                          onChange={(e) =>
                            editSelection(side, { headerRow: e.target.value })
                          }
                        />
                      </label>
                      {input.file.name.toLowerCase().endsWith(".csv") && (
                        <label>
                          {t("compare.encoding")}
                          <select
                            aria-label={`${t(`compare.${side}`)} / ${t("compare.encoding")}`}
                            value={input.encoding}
                            onChange={(e) =>
                              void action(() =>
                                load(
                                  side,
                                  input.file,
                                  e.target.value,
                                  input.delimiter,
                                ),
                              )
                            }
                          >
                            <option value="utf-8-sig">UTF-8</option>
                            <option value="gb18030">GB18030</option>
                          </select>
                        </label>
                      )}
                      {input.file.name.toLowerCase().endsWith(".csv") && (
                        <label>
                          {t("compare.delimiter")}
                          <select
                            aria-label={`${t(`compare.${side}`)} / ${t("compare.delimiter")}`}
                            value={input.delimiter}
                            onChange={(e) =>
                              void action(() =>
                                load(
                                  side,
                                  input.file,
                                  input.encoding,
                                  e.target.value,
                                ),
                              )
                            }
                          >
                            <option value="">
                              {t("compare.autoDelimiter")}
                            </option>
                            <option value=",">
                              {t("compare.commaDelimiter")}
                            </option>
                            <option value=";">
                              {t("compare.semicolonDelimiter")}
                            </option>
                            <option value={"\t"}>
                              {t("compare.tabDelimiter")}
                            </option>
                          </select>
                        </label>
                      )}
                    </div>
                    {(!input.data || !input.confirmedSheet) &&
                      input.names.length > 0 && (
                        <div className="compare-apply">
                          <p>{t("compare.applyHint")}</p>
                          <button
                            className="btn secondary small"
                            onClick={() =>
                              void action(() => readSelection(side))
                            }
                          >
                            {t("compare.readSheet")}
                          </button>
                        </div>
                      )}
                  </details>
                  {input.data && (
                    <>
                      <p className="compare-input-meta">
                        <Check size={15} />
                        {t("compare.inputMeta", {
                          count: input.data.rowCount.toLocaleString(locale),
                          blanks: input.data.blankRows,
                        })}
                      </p>
                      <details className="compare-preview">
                        <summary>{t("compare.preview")}</summary>
                        <div
                          className="compare-table-scroll"
                          tabIndex={0}
                          aria-label={`${t(`compare.${side}`)} / ${t("compare.preview")}`}
                        >
                          <table>
                            <thead>
                              <tr>
                                {input.data.headers.map((header, index) => (
                                  <th key={index}>{header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {input.data.sample.map((row) => (
                                <tr key={row.row}>
                                  {row.values.map((text, index) => (
                                    <td key={index}>{value(text)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  )}
                </>
              )}
            </fieldset>
          );
        })}
      </div>
      {before && after && plan && (
        <div className="compare-match-bar">
          <span>
            {selectedKey
              ? t("compare.matchSummary", {
                  key: before.headers[selectedKey.before],
                  count: selected.length,
                })
              : t("compare.matchNeedsReview")}
          </span>
          <button
            className="btn subtle small"
            disabled={busy}
            onClick={openAdvanced}
          >
            {t("compare.changeMatching")}
          </button>
        </div>
      )}
      {before && after && plan && !summary && !issues && !busy && (
        <section
          className="panel compare-review"
          aria-labelledby="compare-review-title"
        >
          <h2 id="compare-review-title">{t("compare.reviewTitle")}</h2>
          {plan.reason === "overlap" && !manual && (
            <p className="compare-validation">{t("compare.noSharedIDs")}</p>
          )}
          {(plan.reason === "key" || keyIndex === "") && (
            <label className="compare-review-key">
              {t("compare.matchBy")}
              <p>{t("compare.keyHelp")}</p>
              <select
                value={keyIndex}
                aria-label={t("compare.matchBy")}
                onChange={(event) => {
                  invalidate();
                  setManual(true);
                  setKeyIndex(event.target.value);
                }}
              >
                <option value="">{t("compare.chooseKey")}</option>
                {before.headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          )}
          {plan.reviewFields.length > 0 && (
            <>
              <p>{t("compare.renameHelp")}</p>
              <div className="compare-review-fields">
                {plan.reviewFields.map((index) => {
                  const pair = mapping.find((item) => item.before === index);
                  if (!pair) return null;
                  return (
                    <label key={index}>
                      <strong>{before.headers[index]}</strong>
                      <span aria-hidden="true">→</span>
                      <select
                        aria-label={t("compare.reviewMap", {
                          field: before.headers[index],
                        })}
                        value={
                          pair.after ?? (excluded.includes(index) ? "skip" : "")
                        }
                        onChange={(event) => {
                          const choice = event.target.value;
                          updateMapping(index, {
                            after:
                              choice === "skip" || choice === ""
                                ? null
                                : Number(choice),
                            enabled: choice !== "skip" && choice !== "",
                          });
                          if (choice !== "skip")
                            setExcluded((old) =>
                              old.filter((item) => item !== index),
                            );
                        }}
                      >
                        <option value="">{t("compare.chooseField")}</option>
                        <option value="skip">{t("compare.skipField")}</option>
                        {after.headers.map((header, column) => (
                          <option key={column} value={column}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          {plan.reason === "limit" &&
            (selected.length > 50 || !selected.length) && (
              <p className="compare-validation">
                {t(
                  selected.length > 50
                    ? "compare.columnLimit"
                    : "compare.noColumns",
                  { limit: 50 },
                )}
              </p>
            )}
          {!validMapping && keyIndex !== "" && (
            <p className="compare-validation">{t("compare.mappingError")}</p>
          )}
          <button
            className="btn primary"
            disabled={
              !validMapping ||
              plan.reviewFields.some(
                (index) =>
                  mapping.find((pair) => pair.before === index)?.after ===
                    null && !excluded.includes(index),
              )
            }
            onClick={() => void action(compare)}
          >
            <ArrowRightLeft size={16} />
            {t("compare.showDifferences")}
          </button>
        </section>
      )}
      {issues && (
        <section
          className="panel compare-blocked"
          aria-labelledby="compare-blocked-title"
        >
          <h2 id="compare-blocked-title" ref={resultHeading} tabIndex={-1}>
            {t("compare.blocked")}
          </h2>
          <p>
            {t("compare.blockedHint", {
              count: issues.count,
              shown: issues.items.length,
            })}
          </p>
          <div className="compare-table-scroll" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>{t("compare.version")}</th>
                  <th>{t("compare.sourceRow")}</th>
                  <th>{t("compare.key")}</th>
                  <th>{t("compare.problem")}</th>
                </tr>
              </thead>
              <tbody>
                {issues.items.map((issue, index) => (
                  <tr key={index}>
                    <td>{t(`compare.${issue.side}`)}</td>
                    <td>{issue.row}</td>
                    <td className="compare-text">{value(issue.key)}</td>
                    <td>
                      {t(issue.code)}
                      {issue.column && <strong> {issue.column}</strong>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {summary && (
        <section
          className="compare-results"
          aria-labelledby="compare-results-title"
        >
          <div className="compare-result-heading">
            <div>
              <div className="eyebrow">
                {summary.before.file} → {summary.after.file}
              </div>
              <h2 id="compare-results-title" ref={resultHeading} tabIndex={-1}>
                {t("compare.results")}
              </h2>
            </div>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const blob = await getClient().call("export", { locale });
                  downloadBlob(
                    blob,
                    `sheet-comparison-${new Date().toISOString().slice(0, 10)}.xlsx`,
                  );
                })
              }
            >
              <Download size={16} />
              {t("compare.download")}
            </button>
          </div>
          <div className="compare-stats">
            {(["added", "removed", "changed", "unchanged"] as const).map(
              (status) => (
                <div
                  className={`compare-stat ${status}`}
                  key={status}
                  data-testid={`compare-count-${status}`}
                >
                  <span>{t(`compare.${status}`)}</span>
                  <strong>
                    {summary.counts[status].toLocaleString(locale)}
                  </strong>
                </div>
              ),
            )}
          </div>
          <div className="panel compare-result-panel">
            {(summary.uncompared.before.length > 0 ||
              summary.uncompared.after.length > 0) && (
              <p className="compare-excluded-note">
                {t("compare.excludedSummary", {
                  before:
                    summary.uncompared.before.join(", ") || t("compare.none"),
                  after:
                    summary.uncompared.after.join(", ") || t("compare.none"),
                })}
              </p>
            )}
            <details className="compare-exclusions">
              <summary>{t("compare.reportDetails")}</summary>
              <p>{t("compare.reportScope")}</p>
              <p>{t("compare.exactHint")}</p>
              {(["before", "after"] as const).map((side) => (
                <p key={side}>
                  <strong>
                    {t("compare.uncomparedSide", {
                      side: t(`compare.${side}`),
                    })}
                    :{" "}
                  </strong>
                  {summary.uncompared[side].join(", ") || t("compare.none")}
                </p>
              ))}
            </details>
            {!summary.counts.changed &&
              !summary.counts.added &&
              !summary.counts.removed && (
                <p className="compare-identical" role="status">
                  <Check size={17} />
                  {t("compare.identical")}
                </p>
              )}
            <div className="compare-filters">
              <label>
                {t("compare.filter")}
                <select
                  aria-label={t("compare.filter")}
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value as CompareFilter);
                    setPage(1);
                  }}
                >
                  {[
                    "differences",
                    "all",
                    "added",
                    "removed",
                    "changed",
                    "unchanged",
                  ].map((status) => (
                    <option value={status} key={status}>
                      {t(`compare.${status}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("compare.search")}
                <input
                  type="search"
                  aria-label={t("compare.search")}
                  placeholder={t("compare.searchPlaceholder")}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </div>
            {loadingRows ? (
              <p role="status">{t("compare.loadingRows")}</p>
            ) : (
              <>
                {records.rows.length === 0 ? (
                  <p className="compare-no-matches">{t("compare.noMatches")}</p>
                ) : (
                  <div className="compare-records">
                    {records.rows.map((row) => (
                      <article
                        className="compare-record"
                        key={`${row.status}:${row.key}`}
                      >
                        <div className="compare-record-title">
                          <span className={`compare-status ${row.status}`}>
                            {t(`compare.${row.status}`)}
                          </span>
                          <strong className="compare-text">{row.key}</strong>
                          <span className="compare-row-ref">
                            {t("compare.before")}:{" "}
                            {row.beforeRow === null
                              ? "—"
                              : t("compare.rowRef", {
                                  row: row.beforeRow,
                                })}{" "}
                            · {t("compare.after")}:{" "}
                            {row.afterRow === null
                              ? "—"
                              : t("compare.rowRef", { row: row.afterRow })}
                          </span>
                        </div>
                        <div className="compare-change-summary">
                          {(row.status === "changed"
                            ? row.changed
                            : row.status === "unchanged"
                              ? []
                              : summary.options.columns
                                  .map((_, index) => index)
                                  .slice(0, 3)
                          ).map((index) => (
                            <span key={index}>
                              <strong>
                                {
                                  summary.before.headers[
                                    summary.options.columns[index].before
                                  ]
                                }
                              </strong>
                              {row.status !== "added" && (
                                <span className="compare-text compare-old-value">
                                  {value(row.before?.[index])}
                                </span>
                              )}
                              {row.status === "changed" && (
                                <span aria-hidden="true">→</span>
                              )}
                              {row.status !== "removed" && (
                                <span className="compare-text compare-new-value">
                                  {value(row.after?.[index])}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                        <details>
                          <summary>{t("compare.details")}</summary>
                          <div className="compare-table-scroll" tabIndex={0}>
                            <table className="compare-values">
                              <thead>
                                <tr>
                                  <th>{t("compare.field")}</th>
                                  <th>{t("compare.before")}</th>
                                  <th>{t("compare.after")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <th scope="row">{t("compare.key")}</th>
                                  <td className="compare-text">
                                    {value(row.beforeKey, row.before === null)}
                                  </td>
                                  <td className="compare-text">
                                    {value(row.afterKey, row.after === null)}
                                  </td>
                                </tr>
                                {summary.options.columns.map((pair, index) => (
                                  <tr
                                    key={index}
                                    className={
                                      row.changed.includes(index)
                                        ? "compare-cell-changed"
                                        : ""
                                    }
                                  >
                                    <th scope="row">
                                      {summary.before.headers[pair.before]}
                                      {summary.before.headers[pair.before] !==
                                        summary.after.headers[pair.after] && (
                                        <small>
                                          {" "}
                                          → {summary.after.headers[pair.after]}
                                        </small>
                                      )}
                                    </th>
                                    <td className="compare-text">
                                      {value(
                                        row.before?.[index],
                                        row.before === null,
                                      )}
                                    </td>
                                    <td className="compare-text">
                                      {value(
                                        row.after?.[index],
                                        row.after === null,
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </article>
                    ))}
                  </div>
                )}
                <div className="compare-pagination">
                  <span>
                    {t("compare.page", {
                      page: records.page,
                      pages: Math.max(1, Math.ceil(records.total / 25)),
                      count: records.total.toLocaleString(locale),
                    })}
                  </span>
                  <div className="button-group">
                    <button
                      className="btn secondary small"
                      disabled={records.page <= 1}
                      onClick={() => setPage(records.page - 1)}
                    >
                      {t("compare.previous")}
                    </button>
                    <button
                      className="btn secondary small"
                      disabled={records.page * 25 >= records.total}
                      onClick={() => setPage(records.page + 1)}
                    >
                      {t("compare.next")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}
      {before && after && (
        <details
          className="compare-advanced"
          ref={advancedRef}
          open={advanced}
          onToggle={(event) => setAdvanced(event.currentTarget.open)}
        >
          <summary>{t("compare.advanced")}</summary>
          <fieldset className="panel compare-settings" disabled={busy}>
            <legend>
              <span className="compare-number">03</span>{" "}
              {t("compare.mappingTitle")}
            </legend>
            <p>{t("compare.mappingHint")}</p>
            <label className="compare-key-label">
              {t("compare.key")}
              <select
                aria-label={t("compare.key")}
                value={keyIndex}
                onChange={(e) => {
                  invalidate();
                  setKeyIndex(e.target.value);
                  setManual(true);
                }}
              >
                <option value="">{t("compare.chooseKey")}</option>
                {before.headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="compare-table-scroll"
              tabIndex={0}
              aria-label={t("compare.mappingTitle")}
            >
              <table className="compare-mapping">
                <thead>
                  <tr>
                    <th>{t("compare.include")}</th>
                    <th>{t("compare.before")}</th>
                    <th>{t("compare.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((pair) => {
                    const isKey = pair.before === selectedKey?.before;
                    return (
                      <tr
                        key={pair.before}
                        className={isKey ? "compare-key-row" : ""}
                      >
                        <td>
                          {isKey ? (
                            <span className="compare-key-tag">
                              {t("compare.key")}
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={pair.enabled}
                              aria-label={t("compare.includeField", {
                                field: before.headers[pair.before],
                              })}
                              onChange={(e) =>
                                updateMapping(pair.before, {
                                  enabled: e.target.checked,
                                })
                              }
                            />
                          )}
                        </td>
                        <th scope="row" data-label={t("compare.before")}>
                          {before.headers[pair.before]}
                        </th>
                        <td data-label={t("compare.after")}>
                          <select
                            aria-label={t("compare.mapField", {
                              field: before.headers[pair.before],
                            })}
                            value={pair.after ?? ""}
                            onChange={(e) =>
                              updateMapping(pair.before, {
                                after:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                                enabled: e.target.value !== "",
                              })
                            }
                          >
                            <option value="">{t("compare.unmapped")}</option>
                            {after.headers.map((header, index) => (
                              <option value={index} key={index}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="compare-selected">
              {t("compare.selectedFields", { count: selected.length })}
            </p>
            <div className="compare-options">
              <strong>{t("compare.normalization")}</strong>
              <label>
                <input
                  type="checkbox"
                  checked={trim}
                  onChange={(e) => {
                    invalidate();
                    setTrim(e.target.checked);
                    setManual(true);
                  }}
                />
                {t("compare.trim")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={ignoreCase}
                  onChange={(e) => {
                    invalidate();
                    setIgnoreCase(e.target.checked);
                    setManual(true);
                  }}
                />
                {t("compare.ignoreCase")}
              </label>
              <p>{t("compare.exactHint")}</p>
            </div>
            {selectedKey && !validMapping && (
              <p className="compare-validation">
                {selected.length > 50
                  ? t("compare.columnLimit", { limit: 50 })
                  : t("compare.mappingError")}
              </p>
            )}
            <div className="compare-run">
              <button
                className="btn primary"
                disabled={busy || !validMapping}
                onClick={() => void action(compare)}
              >
                <ArrowRightLeft size={17} />
                {t("compare.run")}
              </button>
              <span>{t("compare.notComparedHint")}</span>
            </div>
          </fieldset>
        </details>
      )}
    </section>
  );
}
