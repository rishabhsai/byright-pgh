"use client";
import { memo, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Lot, RuleSet, Triage, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { scoreLot, compareTriageRanked, isAvailable, STATUS_GROUPS, type StatusGroup, type TriageRanked } from "@/lib/ranking";
import { yellowReason, type Evidence } from "@/lib/evidence";
import { EvidenceGlyphs } from "./ui/EvidenceRow";
import { isReadyLot } from "@/lib/plan";
import type { Evaluations, Triages } from "./ByRightApp";
import NeighborhoodPicker, { type NeighborhoodOption } from "./NeighborhoodPicker";
import { reasonText } from "./ui/answer";
import SearchBox from "./SearchBox";
import { revealInScroller } from "./ui/revealInScroller";
import Segmented from "./ui/Segmented";
import {
  TRIAGE_COLOR,
  TRIAGE_SHORT,
  TRIAGE_WORD,
  TriageChip,
  TYPOLOGIES,
  TYPOLOGY_SHORT,
  VerdictDot,
  VerdictLegend,
  VERDICT_SHORT,
  ZoneChip,
} from "./verdict";

export interface Filters {
  /** Empty means every neighborhood. */
  neighborhoods: string[];
  typology: Typology | "";
  onlyByRight: boolean;
  minArea: number;
  triage: Triage | "";
  /** City inventory status bucket; empty means any. */
  status: StatusGroup | "";
  /** Parks, greenways and infrastructure protection are hidden unless this is on. */
  includeParks: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  neighborhoods: [],
  typology: "",
  onlyByRight: false,
  minArea: 0,
  triage: "",
  status: "",
  includeParks: false,
};

export function filtersActive(f: Filters): boolean {
  return f.neighborhoods.length > 0 || !!f.typology || f.onlyByRight || f.minArea > 0 || !!f.triage || !!f.status || f.includeParks;
}

const TRIAGE_FILTERS: Filters["triage"][] = ["", "green", "yellow", "red", "gray"];

const STATUS_LABEL: Record<StatusGroup, string> = {
  "Available for Sale": "Available for Sale",
  "Sale Pending": "Sale Pending",
  "Hold for Study": "Hold for Study",
  "Permanent City Ownership": "Permanent City Ownership",
  other: "Other",
};

function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px] text-ink select-none">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full bg-[#cfd3cc] transition-colors peer-checked:bg-v-byright peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform peer-checked:after:translate-x-[12px]"
      />
      {children}
    </label>
  );
}

/** Short chip text for City inventory statuses. */
function statusChip(status: string): string {
  if (status === "Available for Sale") return "For sale";
  return status || "Status n/a";
}

const TYPE_CHIP: Record<Typology, string> = {
  single: "House",
  single_adu: "+ Unit",
  duplex: "Duplex",
  triplex: "Triplex",
  townhome: "Townhouse",
};

/** One letter per home type for the list's column header; unique, in TYPOLOGIES order. */
const TYPE_LETTER: Record<Typology, string> = {
  single: "H",
  single_adu: "B",
  duplex: "D",
  triplex: "T",
  townhome: "W",
};

/** Base minimum lot sizes of the density subdistricts, Title Nine §903.03. */
const AREA_PRESETS: { sf: number; title: string }[] = [
  { sf: 0, title: "No minimum" },
  { sf: 1200, title: "High-density (-H) subdistrict minimum" },
  { sf: 2400, title: "Moderate-density (-M) subdistrict minimum" },
  { sf: 3000, title: "Low-density (-L) subdistrict minimum" },
];

interface Props {
  lots: Lot[];
  evals: Evaluations | null;
  triages: Triages | null;
  ruleSet: RuleSet;
  filters: Filters;
  onFilters: (f: Filters) => void;
  matches: boolean[];
  selectedIdx: number | null;
  onSelect: (i: number) => void;
  evidence: Evidence[] | null;
  /** The Home type the city-wide results were computed for (lags the filter while recomputing). */
  typology: Typology | null;
  tab: Tab;
  onTab: (t: Tab) => void;
  /** The city-wide evaluation has not arrived yet: show skeletons, never empty states. */
  loading: boolean;
  /** Open the plan in the wide reading overlay. */
  onReadPlan?: () => void;
  /** The plan, derived by the app; null while the city-wide pass is running. */
  plan: ReactNode;
}

export type Tab = "lots" | "plan";

const LIST_LIMIT = 200;

/** One-line summary of the active filters for the collapsed disclosure. */
function filterSummary(f: Filters): string {
  const parts: string[] = [];
  if (f.triage) parts.push(TRIAGE_WORD[f.triage]);
  if (f.neighborhoods.length) parts.push(f.neighborhoods.length === 1 ? f.neighborhoods[0] : `${f.neighborhoods[0]} +${f.neighborhoods.length - 1}`);
  if (f.typology) parts.push(TYPE_CHIP[f.typology]);
  if (f.status) parts.push(STATUS_LABEL[f.status]);
  if (f.onlyByRight) parts.push("only by-right");
  if (f.minArea) parts.push(`${f.minArea.toLocaleString()}+ sf`);
  if (f.includeParks) parts.push("with parks");
  return parts.length ? parts.join(", ") : "None; parks and greenways hidden";
}

/** A list row's footprint, for skeletons: same padding, two text lines, dot column. */
function SkeletonRow() {
  return (
    <li aria-hidden className="flex items-start gap-2 rounded-md px-2 py-2">
      <span className="mt-px h-4 w-[18px] animate-pulse rounded-[4px] bg-surface" />
      <span className="min-w-0 flex-1">
        <span className="block h-[18px] py-[3px]">
          <span className="block h-full w-2/3 animate-pulse rounded-sm bg-surface" />
        </span>
        <span className="mt-0.5 block h-4 py-[2px]">
          <span className="block h-full w-[85%] animate-pulse rounded-sm bg-surface" />
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="h-[9px] w-[76px] animate-pulse rounded-sm bg-surface" />
        <span className="h-3 w-12 animate-pulse rounded-sm bg-surface" />
      </span>
    </li>
  );
}

function LeftRail({
  lots,
  evals,
  triages,
  ruleSet,
  filters,
  onFilters,
  matches,
  selectedIdx,
  onSelect,
  evidence,
  typology,
  tab,
  onTab,
  loading,
  onReadPlan,
  plan,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const filtersId = useId();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  // Short screens (laptops at 800 px) start with the filters folded so the list gets the height.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- viewport is only known after hydration
    if (window.innerHeight < 900) setFiltersOpen(false);
  }, []);

  const hoodOptions = useMemo<NeighborhoodOption[]>(() => {
    const m = new Map<string, NeighborhoodOption>();
    const tr = triages?.[ruleSet].results;
    lots.forEach((l, i) => {
      if (!l.neighborhood) return;
      let o = m.get(l.neighborhood);
      if (!o) m.set(l.neighborhood, (o = { name: l.neighborhood, lots: 0, green: 0 }));
      o.lots++;
      if (tr?.[i].triage === "green") o.green++;
    });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [lots, triages, ruleSet]);

  const searchTriage = useMemo(() => triages?.[ruleSet].results.map((t) => t.triage), [triages, ruleSet]);

  const matchCount = useMemo(() => matches.reduce((n, m) => (m ? n + 1 : n), 0), [matches]);

  const typIdx = typology ? TYPOLOGIES.indexOf(typology) : -1;

  const readyHoods = useMemo(() => {
    if (!evals) return [];
    const m = new Map<string, number>();
    evals[ruleSet].findings.forEach((f, i) => {
      const l = lots[i];
      if (l.neighborhood && isReadyLot(l, f, typology)) m.set(l.neighborhood, (m.get(l.neighborhood) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name, n]) => ({ name, n }));
  }, [evals, ruleSet, lots, typology]);

  const maxHood = readyHoods[0]?.n ?? 1;

  const ranked = useMemo(() => {
    if (!evals || !triages) return { rows: [], total: 0 };
    const e = evals[ruleSet];
    const tr = triages[ruleSet];
    const rows: (TriageRanked & { i: number })[] = [];
    for (let i = 0; i < lots.length; i++) {
      if (!matches[i]) continue;
      // Unscreened finance never orders the list: only a screened margin or shortfall counts.
      const fin = evidence?.[i]?.checks.find((c) => c.id === "finance")?.state;
      const screened = fin === "pass" || fin === "fail";
      rows.push({
        i,
        score: scoreLot(lots[i], e.findings[i]),
        lot: lots[i],
        triage: tr.results[i].triage,
        margin: screened ? tr.margin[i] : null,
        byRight: typIdx < 0 ? e.best[i] === "by-right" : e.findings[i][typIdx].verdict === "by-right",
        gap: screened ? tr.results[i].gap : null,
      });
    }
    rows.sort(compareTriageRanked);
    return { rows: rows.slice(0, LIST_LIMIT), total: rows.length };
  }, [evals, triages, ruleSet, lots, matches, typIdx, evidence]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onFilters({ ...filters, [k]: v });
  const toggleHood = (name: string) =>
    set(
      "neighborhoods",
      filters.neighborhoods.includes(name)
        ? filters.neighborhoods.filter((n) => n !== name)
        : [...filters.neighborhoods, name],
    );

  const advancedOn = filters.minArea > 0 || filters.includeParks;
  const active = filtersActive(filters);

  // Keyboard cursor in the list: a row position, clamped to the rows on screen.
  const rows = ranked.rows;
  const selectedPos = selectedIdx == null ? -1 : rows.findIndex((r) => r.i === selectedIdx);
  const cur = rows.length ? Math.min(cursor ?? Math.max(selectedPos, 0), rows.length - 1) : -1;
  const rowId = (pos: number) => `${listId}-r${pos}`;

  const moveCursor = (pos: number) => {
    setCursor(pos);
    revealInScroller(document.getElementById(rowId(pos)));
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!rows.length) return;
    let next: number | null = null;
    if (e.key === "ArrowDown") next = Math.min(cur + 1, rows.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(cur - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    else if (e.key === "PageDown") next = Math.min(cur + 8, rows.length - 1);
    else if (e.key === "PageUp") next = Math.max(cur - 8, 0);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(rows[cur].i);
      return;
    }
    if (next == null) return;
    e.preventDefault();
    moveCursor(next);
  };

  return (
    <aside className="flex w-[344px] shrink-0 flex-col border-r border-hairline bg-panel">
      <div className="space-y-2 px-4 pt-3 pb-2">
        <SearchBox lots={lots} onPick={onSelect} onScope={(h) => set("neighborhoods", [h])} triage={searchTriage} matches={matches} selectedIdx={selectedIdx} />
        <Segmented<Tab>
          kind="tabs"
          label="Rail view"
          equal
          value={tab}
          onChange={onTab}
          options={[
            { value: "lots", label: "Lots" },
            { value: "plan", label: "Plan" },
          ]}
        />
      </div>

      {tab === "plan" ? (
        <div role="tabpanel" aria-label="Plan" data-scroll className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-hairline px-4 pt-2 pb-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-[22px] leading-none">Disposition plan</h2>
              {onReadPlan && evals && triages && evidence && (
                <button
                  onClick={onReadPlan}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-white px-2 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-surface active:scale-[0.98]"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                    <path d="M7.5 1H11v3.5M4.5 11H1V7.5M11 1L7 5M1 11l4-4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Open in reading view
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[13px] leading-[18px] text-muted">
              Which City lots pass the use-table and lot-size screen, through which channel, and the modeled shortfall per project.
              Scope follows the neighborhood filter.
            </p>
            <div className="mt-3">
              <NeighborhoodPicker options={hoodOptions} selected={filters.neighborhoods} onChange={(v) => set("neighborhoods", v)} />
            </div>
          </div>
          {plan ? (
            plan
          ) : (
            <div aria-hidden className="space-y-3 px-4 pt-3">
              {[72, 120, 150].map((h) => (
                <div key={h} className="animate-pulse rounded-lg bg-surface" style={{ height: h }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="border-b border-hairline px-4 pb-2">
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen((o) => !o)}
              className="flex h-8 w-full items-center gap-2 text-left"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className={`shrink-0 text-muted transition-transform ${filtersOpen ? "" : "-rotate-90"}`}>
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
              </svg>
              <span className="text-[13px] font-medium text-ink">Filters</span>
              {!filtersOpen && <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{filterSummary(filters)}</span>}
            </button>

            <div id={filtersId} hidden={!filtersOpen} className="pb-1">
              <p className="text-[12px] leading-4 text-muted">
                Ranked: available for sale first, then by right, no hazard flag, at least 1,000 sf, lowest modeled shortfall.
              </p>

              <div className="mt-2.5">
                <span className="mb-1 block text-[11px] text-muted">Triage</span>
                <Segmented<Filters["triage"]>
                  label="Triage filter"
                  value={filters.triage}
                  onChange={(t) => set("triage", t)}
                  options={TRIAGE_FILTERS.map((t) => ({
                    value: t,
                    title: t ? TRIAGE_SHORT[t] : "Every triage color",
                    label: (
                      <>
                        {t && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: TRIAGE_COLOR[t] }} />}
                        {t ? TRIAGE_WORD[t] : "Any"}
                      </>
                    ),
                  }))}
                />
              </div>

              <div className="mt-2.5">
                <NeighborhoodPicker options={hoodOptions} selected={filters.neighborhoods} onChange={(v) => set("neighborhoods", v)} />
              </div>

              <div className="mt-2.5">
                <span className="mb-1 block text-[11px] text-muted">Home type</span>
                <Segmented<Filters["typology"]>
                  label="Home type"
                  value={filters.typology}
                  onChange={(t) => set("typology", t)}
                  options={(["", ...TYPOLOGIES] as Filters["typology"][]).map((t) => ({
                    value: t,
                    title: t ? `${TYPOLOGY_LABEL[t]}: map and dots show this type's verdict` : "Best verdict across all types",
                    label: t ? TYPE_CHIP[t] : "Any",
                  }))}
                />
              </div>

              <div className="mt-2.5 grid grid-cols-[1fr_auto] items-end gap-x-4">
                <div>
                  <label htmlFor="status-filter" className="mb-1 block text-[11px] text-muted">
                    Status
                  </label>
                  <select
                    id="status-filter"
                    value={filters.status}
                    onChange={(e) => set("status", e.target.value as Filters["status"])}
                    className="h-7 w-full rounded-[6px] border border-hairline bg-white px-2 text-[13px] text-ink focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                    style={{ outline: "none" }}
                  >
                    <option value="">Any</option>
                    {STATUS_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {STATUS_LABEL[g]}
                      </option>
                    ))}
                  </select>
                </div>
                <Switch checked={filters.onlyByRight} onChange={(v) => set("onlyByRight", v)}>
                  Only by-right
                </Switch>
              </div>

              <details className="group mt-1.5" open={advancedOn || undefined}>
                <summary className="cursor-pointer py-1 text-[12px] text-muted select-none hover:text-ink">Advanced</summary>
                <div className="mt-1.5 space-y-2">
                  <div>
                    <label htmlFor="min-lot-area" className="mb-1 block text-[11px] text-muted">
                      Min lot area
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex w-[104px] items-center rounded-md border border-hairline bg-white focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
                        <input
                          id="min-lot-area"
                          inputMode="numeric"
                          autoComplete="off"
                          value={filters.minArea ? filters.minArea.toLocaleString() : ""}
                          placeholder="Any"
                          onChange={(e) => set("minArea", Number(e.target.value.replace(/[^\d]/g, "").slice(0, 7)) || 0)}
                          className="w-full min-w-0 bg-transparent py-1 pl-2 text-[12px] tabular-nums placeholder:text-faint"
                          style={{ outline: "none" }}
                        />
                        <span className="pr-2 pl-1 text-[11px] text-faint select-none">sf</span>
                      </div>
                      <div className="flex gap-1" role="group" aria-label="Lot area presets">
                        {AREA_PRESETS.map((p) => {
                          const on = filters.minArea === p.sf;
                          return (
                            <button
                              key={p.sf}
                              title={p.title}
                              aria-pressed={on}
                              onClick={() => set("minArea", p.sf)}
                              className={`rounded border px-1.5 py-px text-[11px] tabular-nums transition-colors ${
                                on
                                  ? "border-accent/40 bg-accent-soft font-medium text-accent"
                                  : "border-hairline bg-white text-muted hover:border-[#bfc4bd] hover:text-ink"
                              }`}
                            >
                              {p.sf ? p.sf.toLocaleString() : "Any"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <Switch checked={filters.includeParks} onChange={(v) => set("includeParks", v)}>
                    Include parks and greenways
                  </Switch>
                </div>
              </details>

              <div className="mt-2 border-t border-hairline pt-2">
                <h3 className="text-[12px] font-medium text-ink">
                  Neighborhoods with the most review candidates
                  {typology && <span className="text-muted">, {TYPOLOGY_SHORT[typology]}</span>}
                </h3>
                <p className="mt-0.5 text-[11px] text-faint">Pass the use table, for sale, no hazard flag, at least 1,000 sf</p>
                <ol className="mt-1.5 space-y-1">
                  {loading &&
                    [92, 80, 70, 64, 58].map((w) => (
                      <li key={w} aria-hidden className="h-5 px-1.5 py-[3px]">
                        <span className="block h-full animate-pulse rounded-sm bg-surface" style={{ width: `${w}%` }} />
                      </li>
                    ))}
                  {!loading && readyHoods.length === 0 && <li className="text-[12px] text-muted">No review candidates under this rule set.</li>}
                  {readyHoods.map((h) => (
                    <li key={h.name}>
                      <button
                        onClick={() => toggleHood(h.name)}
                        aria-pressed={filters.neighborhoods.includes(h.name)}
                        title={filters.neighborhoods.includes(h.name) ? `Remove ${h.name} from the filter` : `Add ${h.name} to the filter`}
                        className={`group relative flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[12px] ${
                          filters.neighborhoods.includes(h.name) ? "bg-accent-soft font-medium" : "hover:bg-surface"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="absolute inset-y-0.5 left-0 rounded-sm bg-v-byright/10 transition-[width] duration-500"
                          style={{ width: `${(h.n / maxHood) * 100}%` }}
                        />
                        <span className="relative flex-1 truncate">{h.name}</span>
                        <span className="relative w-12 text-right font-medium tabular-nums">{h.n.toLocaleString()}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          <div className="flex min-h-9 items-center justify-between gap-2 px-4 py-1">
            <span
              className="min-w-0 text-[12px] leading-4 text-muted"
              aria-live="polite"
            >
              {loading ? (
                "Evaluating lots…"
              ) : (
                <>
                  Showing{" "}
                  <span className="font-medium text-ink tabular-nums">
                    {matchCount.toLocaleString()}
                  </span>{" "}
                  of{" "}
                  <span className="tabular-nums">
                    {lots.length.toLocaleString()}
                  </span>
                  {ranked.total > LIST_LIMIT && (
                    <span className="text-faint">
                      , top {LIST_LIMIT} listed
                    </span>
                  )}
                  {filtersOpen && !filters.includeParks && (
                    <span className="whitespace-nowrap text-faint">
                      {" · "}parks and greenways hidden ·{" "}
                      <button
                        onClick={() => set("includeParks", true)}
                        className="text-accent hover:underline"
                      >
                        show
                      </button>
                    </span>
                  )}
                </>
              )}
            </span>
            {active ? (
              <button onClick={() => onFilters(DEFAULT_FILTERS)} className="shrink-0 text-[12px] font-medium text-accent hover:underline">
                Reset
              </button>
            ) : (
              <span
                className="flex shrink-0 cursor-help items-center gap-1 text-[11px] text-faint"
                title={TYPOLOGIES.map(
                  (t) => `${TYPE_LETTER[t]} ${TYPOLOGY_LABEL[t]}`,
                ).join(" · ")}
                aria-hidden
              >
                {TYPOLOGIES.map((t) => (
                  <span
                    key={t}
                    title={TYPOLOGY_LABEL[t]}
                    className="w-3 text-center"
                  >
                    {TYPE_LETTER[t]}
                  </span>
                ))}
              </span>
            )}
          </div>

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Lots, best first. Arrow keys move, Enter opens."
            aria-busy={loading || undefined}
            tabIndex={rows.length ? 0 : -1}
            aria-activedescendant={cur >= 0 ? rowId(cur) : undefined}
            onKeyDown={onListKey}
            data-scroll
            className="scroll-thin group/list relative min-h-0 flex-1 overflow-y-auto px-2 pb-2 focus-visible:outline-offset-[-2px]"
          >
            {loading && Array.from({ length: 8 }, (_, k) => <SkeletonRow key={k} />)}
            {!loading &&
              rows.map(({ i, lot, triage }, pos) => {
                const f = evals![ruleSet].findings[i];
                const selected = i === selectedIdx;
                const ev = evidence?.[i];
                const reason = ev
                  ? reasonText(
                      yellowReason(triages![ruleSet].results[i], ev, lot),
                    )
                  : null;
                return (
                  <li
                    key={lot.id}
                    id={rowId(pos)}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setCursor(pos);
                      onSelect(i);
                    }}
                    className={`group flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                      selected ? "bg-accent-soft ring-1 ring-accent/30" : "hover:bg-surface"
                    } ${pos === cur ? "group-focus-visible/list:ring-2 group-focus-visible/list:ring-accent" : ""}`}
                  >
                    <span className="mt-px">
                      <TriageChip triage={triage} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{lot.address || lot.id}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                        <ZoneChip zone={lot.zone} />
                        <span
                          title={`City inventory status: ${lot.status || "not recorded"}; type: ${lot.inventoryType || "not recorded"}`}
                          className={`shrink-0 rounded px-1 py-px text-[10px] leading-[14px] ${
                            isAvailable(lot) ? "bg-accent-soft font-medium text-accent" : "bg-surface text-faint"
                          }`}
                        >
                          {statusChip(lot.status)}
                        </span>
                        {ev && <EvidenceGlyphs evidence={ev} extra={reason ? [`Yellow: ${reason}`] : undefined} />}
                        <span className="truncate" title={reason ? `${lot.neighborhood}: ${reason}` : lot.neighborhood}>
                          {lot.neighborhood}
                          {reason && <span className="text-faint">, {reason}</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        {f.map((x) => (
                          <span key={x.typology} className="flex w-3 justify-center">
                            <VerdictDot verdict={x.verdict} size={9} title={`${TYPOLOGY_LABEL[x.typology]}: ${VERDICT_SHORT[x.verdict]}`} />
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted tabular-nums">
                        {lot.lotAreaSqFt != null ? `${lot.lotAreaSqFt.toLocaleString()} sf` : "area n/a"}
                      </span>
                    </div>
                  </li>
                );
              })}
            {!loading && rows.length === 0 && (
              <li className="px-2 py-6 text-center text-[12px] text-muted">No lots match these filters. Clear a filter or switch the rule set.</li>
            )}
          </ul>

          <div className="border-t border-hairline px-4 py-2">
            <VerdictLegend />
          </div>
        </>
      )}
    </aside>
  );
}

export default memo(LeftRail);
