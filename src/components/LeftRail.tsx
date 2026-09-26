"use client";
import { memo, useMemo, useState, type ReactNode } from "react";
import type { Comps, Lot, RuleSet, Triage, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { scoreLot, compareTriageRanked, isAvailable, STATUS_GROUPS, type StatusGroup, type TriageRanked } from "@/lib/ranking";
import { EVIDENCE_STATE_LABEL, yellowReason, type Evidence } from "@/lib/evidence";
import { isReadyLot } from "@/lib/plan";
import type { FinanceAssumptions } from "@/lib/finance";
import type { Evaluations, Triages } from "./ByRightApp";
import NeighborhoodPicker, { type NeighborhoodOption } from "./NeighborhoodPicker";
import PlanView from "./PlanView";
import {
  TRIAGE_COLOR,
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

/** "5/6" evidence pill for list rows; the title spells out each check. */
function EvidencePill({ evidence, reason }: { evidence: Evidence; reason: string | null }) {
  const full = evidence.passed === evidence.total;
  const title = [
    `${evidence.passed} of ${evidence.total} checks pass or are out of scope`,
    ...evidence.checks.map((c) => `${c.label}: ${EVIDENCE_STATE_LABEL[c.state]}`),
    ...(reason ? [`Yellow: ${reason}`] : []),
  ].join("\n");
  return (
    <span
      title={title}
      className={`rounded px-1 py-px text-[10px] leading-[14px] font-medium tabular-nums ${
        full ? "bg-[#dcfce7] text-[#15803d]" : "bg-surface text-muted"
      }`}
    >
      {evidence.passed}/{evidence.total}
    </span>
  );
}

/** Short chip text for City inventory statuses. */
function statusChip(status: string): string {
  if (status === "Available for Sale") return "For sale";
  return status || "Status n/a";
}

const TYPE_CHIP: Record<Typology, string> = {
  single: "Single",
  single_adu: "+ADU",
  duplex: "Duplex",
  triplex: "Triplex",
  townhome: "Townhome",
};

/** Base minimum lot sizes of the density subdistricts, Title Nine §903.03. */
const AREA_PRESETS: { sf: number; title: string }[] = [
  { sf: 0, title: "No minimum" },
  { sf: 1200, title: "High-density (-H) subdistrict minimum" },
  { sf: 2400, title: "Moderate-density (-M) subdistrict minimum" },
  { sf: 3000, title: "Low-density (-L) subdistrict minimum" },
];

const segBtn = (on: boolean) =>
  `inline-flex items-center justify-center gap-1.5 rounded px-1.5 py-1 whitespace-nowrap transition-colors ${
    on ? "bg-white font-medium text-ink shadow-[0_0_0_1px_rgba(23,33,30,.08)]" : "text-muted hover:text-ink"
  }`;

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
  comps: (Comps | null)[];
  assumptions: FinanceAssumptions;
  landOverrides: Record<string, number>;
  sources: { name: string; url: string; vintage: string }[];
}

type Tab = "lots" | "plan";

const LIST_LIMIT = 200;

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
  comps,
  assumptions,
  landOverrides,
  sources,
}: Props) {
  const [tab, setTab] = useState<Tab>("lots");
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

  const matchCount = useMemo(() => matches.reduce((n, m) => (m ? n + 1 : n), 0), [matches]);

  const typIdx = filters.typology ? TYPOLOGIES.indexOf(filters.typology) : -1;

  const typology: Typology | null = filters.typology || null;

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
      rows.push({
        i,
        score: scoreLot(lots[i], e.findings[i]),
        lot: lots[i],
        triage: tr.results[i].triage,
        margin: tr.margin[i],
        byRight: typIdx < 0 ? e.best[i] === "by-right" : e.findings[i][typIdx].verdict === "by-right",
        gap: tr.results[i].gap,
      });
    }
    rows.sort(compareTriageRanked);
    return { rows: rows.slice(0, LIST_LIMIT), total: rows.length };
  }, [evals, triages, ruleSet, lots, matches, typIdx]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onFilters({ ...filters, [k]: v });
  const toggleHood = (name: string) =>
    set(
      "neighborhoods",
      filters.neighborhoods.includes(name)
        ? filters.neighborhoods.filter((n) => n !== name)
        : [...filters.neighborhoods, name],
    );

  const advancedOn = filters.minArea > 0 || filters.includeParks;

  return (
    <aside className="flex w-[344px] shrink-0 flex-col border-r border-hairline bg-panel">
      <div className="px-4 pt-3">
        <div role="tablist" aria-label="Rail view" className="grid grid-cols-2 rounded-md border border-hairline bg-surface p-0.5 text-[12.5px]">
          {(["lots", "plan"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={segBtn(tab === t)}
            >
              {t === "lots" ? "Lots" : "Plan"}
            </button>
          ))}
        </div>
      </div>

      {tab === "plan" ? (
        <>
          <div className="border-b border-hairline px-4 pt-3 pb-3">
            <h2 className="font-serif text-[22px] leading-none">Disposition plan</h2>
            <p className="mt-1 text-[12px] text-muted">
              Which City lots can take a small home without a hearing, through which channel, and the gap per home. Scope follows the
              neighborhood filter.
            </p>
            <div className="mt-3">
              <NeighborhoodPicker options={hoodOptions} selected={filters.neighborhoods} onChange={(v) => set("neighborhoods", v)} />
            </div>
          </div>
          {evals && triages && evidence ? (
            <PlanView
              lots={lots}
              evals={evals}
              triages={triages[ruleSet].results}
              evidence={evidence}
              comps={comps}
              assumptions={assumptions}
              landOverrides={landOverrides}
              neighborhoods={filters.neighborhoods}
              typology={typology}
              ruleSet={ruleSet}
              sources={sources}
              onSelect={onSelect}
            />
          ) : (
            <p className="px-4 py-6 text-[12px] text-muted">Evaluating lots…</p>
          )}
        </>
      ) : (
        <>
      <div className="border-b border-hairline px-4 pt-3 pb-3">
        <h2 className="font-serif text-[22px] leading-none">Fast-track finder</h2>
        <p className="mt-1 text-[12px] text-muted">
          Available for sale first, then by right, no hazard flag, at least 1,000 sf, lowest modeled shortfall. Parks and greenways hidden.
        </p>

        <div className="mt-3">
          <span className="mb-1 block text-[11px] text-muted">Triage</span>
          <div role="radiogroup" aria-label="Triage filter" className="grid grid-cols-5 rounded-md border border-hairline bg-surface p-0.5 text-[12px]">
            {TRIAGE_FILTERS.map((t) => (
              <button
                key={t || "any"}
                role="radio"
                aria-checked={filters.triage === t}
                onClick={() => set("triage", t)}
                title={t === "gray" ? "Gray / not evaluated" : undefined}
                className={segBtn(filters.triage === t)}
              >
                {t && <span className="h-2 w-2 rounded-full" style={{ background: TRIAGE_COLOR[t] }} />}
                {t ? TRIAGE_WORD[t] : "Any"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <NeighborhoodPicker
            options={hoodOptions}
            selected={filters.neighborhoods}
            onChange={(v) => set("neighborhoods", v)}
          />
        </div>

        <div className="mt-3">
          <span className="mb-1 block text-[11px] text-muted">Home type</span>
          <div role="radiogroup" aria-label="Home type" className="flex rounded-md border border-hairline bg-surface p-0.5 text-[12px]">
            {(["", ...TYPOLOGIES] as const).map((t) => (
              <button
                key={t || "any"}
                role="radio"
                aria-checked={filters.typology === t}
                title={t ? `${TYPOLOGY_LABEL[t]}: map and dots show this type's verdict` : "Best verdict across all types"}
                onClick={() => set("typology", t)}
                className={`flex-auto ${segBtn(filters.typology === t)}`}
              >
                {t && filters.typology === t && <span className="h-2 w-2 rounded-full bg-v-byright" aria-hidden />}
                {t ? TYPE_CHIP[t] : "Any"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-x-4">
          <div>
            <label htmlFor="status-filter" className="mb-1 block text-[11px] text-muted">
              Status
            </label>
            <select
              id="status-filter"
              value={filters.status}
              onChange={(e) => set("status", e.target.value as Filters["status"])}
              className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px] text-ink focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
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

        <details className="group mt-2" open={advancedOn || undefined}>
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

        {filtersActive(filters) && (
          <div className="mt-2 flex items-center justify-between rounded-md bg-surface px-2.5 py-1.5 text-[12px]" aria-live="polite">
            <span className="text-muted">
              Showing <span className="font-medium text-ink tabular-nums">{matchCount.toLocaleString()}</span> of{" "}
              <span className="tabular-nums">{lots.length.toLocaleString()}</span> lots
            </span>
            <button onClick={() => onFilters(DEFAULT_FILTERS)} className="text-[12px] font-medium text-accent hover:underline">
              Reset
            </button>
          </div>
        )}
      </div>

      <div className="border-b border-hairline px-4 py-3">
        <h3 className="text-[12px] font-medium text-ink">
          Neighborhoods with the most ready lots
          {filters.typology && <span className="text-muted">, {TYPOLOGY_SHORT[filters.typology]}</span>}
        </h3>
        <p className="mt-0.5 text-[10.5px] text-faint">By right, available for sale, no hazard flag, at least 1,000 sf</p>
        <ol className="mt-1.5 space-y-1">
          {readyHoods.length === 0 && <li className="text-[12px] text-muted">No ready lots under this rule set.</li>}
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

      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-[12px] text-muted">
          {ranked.total > LIST_LIMIT
            ? `Top ${LIST_LIMIT} of ${ranked.total.toLocaleString()} lots`
            : `${ranked.total.toLocaleString()} lots`}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-faint">
          {TYPOLOGIES.map((t) => (
            <span
              key={t}
              title={TYPOLOGY_LABEL[t]}
              className={`w-3 text-center ${filters.typology === t ? "font-semibold text-ink" : ""}`}
            >
              {TYPOLOGY_SHORT[t][0]}
            </span>
          ))}
        </span>
      </div>

      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {ranked.rows.map(({ i, lot, triage }) => {
          const f = evals![ruleSet].findings[i];
          const active = i === selectedIdx;
          const ev = evidence?.[i];
          const reason = ev ? yellowReason(triages![ruleSet].results[i], ev) : null;
          return (
            <li key={lot.id}>
              <button
                onClick={() => onSelect(i)}
                className={`group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                  active ? "bg-accent-soft ring-1 ring-accent/30" : "hover:bg-surface"
                }`}
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
                    {ev && <EvidencePill evidence={ev} reason={reason} />}
                    <span className="truncate" title={reason ? `${lot.neighborhood}: ${reason}` : lot.neighborhood}>
                      {lot.neighborhood}
                      {reason && <span className="text-faint"> · {reason}</span>}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    {f.map((x) => (
                      <span key={x.typology} className="flex w-3 justify-center">
                        <VerdictDot
                          verdict={x.verdict}
                          size={9}
                          title={`${TYPOLOGY_LABEL[x.typology]}: ${VERDICT_SHORT[x.verdict]}`}
                        />
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-muted tabular-nums">
                    {lot.lotAreaSqFt != null ? `${lot.lotAreaSqFt.toLocaleString()} sf` : "area n/a"}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {evals && ranked.rows.length === 0 && (
          <li className="px-2 py-6 text-center text-[12px] text-muted">
            No lots match these filters. Clear a filter or switch the rule set.
          </li>
        )}
      </ul>

      <div className="border-t border-hairline px-4 py-2.5">
        <VerdictLegend />
      </div>
        </>
      )}
    </aside>
  );
}

export default memo(LeftRail);
