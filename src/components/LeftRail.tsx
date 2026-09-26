"use client";
import { memo, useMemo } from "react";
import type { Lot, RuleSet, Triage, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { scoreLot, compareTriageRanked, isAvailable, type TriageRanked } from "@/lib/ranking";
import type { Evaluations, Triages } from "./ByRightApp";
import NeighborhoodPicker, { type NeighborhoodOption } from "./NeighborhoodPicker";
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
  availableOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  neighborhoods: [],
  typology: "",
  onlyByRight: false,
  minArea: 0,
  triage: "",
  availableOnly: false,
};

export function filtersActive(f: Filters): boolean {
  return f.neighborhoods.length > 0 || !!f.typology || f.onlyByRight || f.minArea > 0 || !!f.triage || f.availableOnly;
}

const TRIAGE_FILTERS: Filters["triage"][] = ["", "green", "yellow", "red", "gray"];

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
}

const LIST_LIMIT = 200;

function LeftRail({ lots, evals, triages, ruleSet, filters, onFilters, matches, selectedIdx, onSelect }: Props) {
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

  const topHoods = useMemo(() => {
    if (!evals) return [];
    const count = (rs: RuleSet) => {
      const m = new Map<string, number>();
      evals[rs].findings.forEach((f, i) => {
        const ok = typIdx < 0 ? evals[rs].best[i] === "by-right" : f[typIdx].verdict === "by-right";
        if (ok) m.set(lots[i].neighborhood, (m.get(lots[i].neighborhood) ?? 0) + 1);
      });
      return m;
    };
    const now = count(ruleSet);
    const base = ruleSet === "current" ? null : count("current");
    const green = new Map<string, number>();
    triages?.[ruleSet].results.forEach((t, i) => {
      if (t.triage === "green") green.set(lots[i].neighborhood, (green.get(lots[i].neighborhood) ?? 0) + 1);
    });
    return Array.from(now.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, n]) => ({ name, n, green: green.get(name) ?? 0, delta: base ? n - (base.get(name) ?? 0) : 0 }));
  }, [evals, triages, ruleSet, lots, typIdx]);

  const maxHood = topHoods[0]?.n ?? 1;

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
      });
    }
    rows.sort(compareTriageRanked);
    return { rows: rows.slice(0, LIST_LIMIT), total: rows.length };
  }, [evals, triages, ruleSet, lots, matches]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onFilters({ ...filters, [k]: v });
  const toggleHood = (name: string) =>
    set(
      "neighborhoods",
      filters.neighborhoods.includes(name)
        ? filters.neighborhoods.filter((n) => n !== name)
        : [...filters.neighborhoods, name],
    );

  return (
    <aside className="flex w-[344px] shrink-0 flex-col border-r border-hairline bg-panel">
      <div className="border-b border-hairline px-4 pt-4 pb-3">
        <h2 className="font-serif text-[22px] leading-none">Fast-track finder</h2>
        <p className="mt-1 text-[12px] text-muted">
          Lots available for sale first, then green, yellow, red and gray. Within a color, most home types by right, then best margin.
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
                className={`inline-flex items-center justify-center gap-1.5 rounded px-1.5 py-1 transition-colors ${
                  filters.triage === t ? "bg-white font-medium text-ink shadow-[0_0_0_1px_rgba(23,33,30,.08)]" : "text-muted hover:text-ink"
                }`}
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

        <div className="mt-3 grid grid-cols-[1fr_auto] items-start gap-x-4">
          <div>
            <label htmlFor="min-lot-area" className="mb-1 block text-[11px] text-muted">
              Min lot area
            </label>
            <div className="flex items-center rounded-md border border-hairline bg-white focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
              <input
                id="min-lot-area"
                inputMode="numeric"
                autoComplete="off"
                value={filters.minArea ? filters.minArea.toLocaleString() : ""}
                placeholder="Any"
                onChange={(e) => set("minArea", Number(e.target.value.replace(/[^\d]/g, "").slice(0, 7)) || 0)}
                className="w-full min-w-0 bg-transparent py-1.5 pl-2 text-[12px] tabular-nums placeholder:text-faint"
                style={{ outline: "none" }}
              />
              <span className="pr-2 pl-1 text-[11px] text-faint select-none">sf</span>
            </div>
            <div className="mt-1.5 flex gap-1" role="group" aria-label="Lot area presets">
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

<div className="mt-[22px] flex flex-col">
          <label className="flex cursor-pointer items-center gap-2 py-1.5 text-[12px] text-ink select-none">
            <input
              type="checkbox"
              role="switch"
              checked={filters.onlyByRight}
              onChange={(e) => set("onlyByRight", e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full bg-[#cfd3cc] transition-colors peer-checked:bg-v-byright peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform peer-checked:after:translate-x-[12px]"
            />
            Only by-right
          </label>
          <label className="flex cursor-pointer items-center gap-2 py-1.5 text-[12px] text-ink select-none">
            <input
              type="checkbox"
              role="switch"
              checked={filters.availableOnly}
              onChange={(e) => set("availableOnly", e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full bg-[#cfd3cc] transition-colors peer-checked:bg-v-byright peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:left-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform peer-checked:after:translate-x-[12px]"
            />
            Available for sale only
          </label>
          </div>
        </div>

        {filtersActive(filters) && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-surface px-2.5 py-1.5 text-[12px]" aria-live="polite">
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
          Top neighborhoods by by-right lots
          {filters.typology && <span className="text-muted">, {TYPOLOGY_SHORT[filters.typology]}</span>}
        </h3>
        <div className="mt-1 flex justify-end gap-0 pr-1.5 text-[10.5px] text-faint">
          <span className="w-14 text-right">green lots</span>
          <span className="w-12 text-right">by right</span>
        </div>
        <ol className="mt-0.5 space-y-1">
          {topHoods.length === 0 && <li className="text-[12px] text-muted">No by-right lots under this rule set.</li>}
          {topHoods.map((h) => (
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
                {h.delta > 0 && (
                  <span className="relative text-[11px] font-medium text-[#7a5a00]">+{h.delta.toLocaleString()}</span>
                )}
                <span className="relative inline-flex w-14 items-center justify-end gap-1 text-right tabular-nums text-[#15803d]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" aria-hidden />
                  {h.green.toLocaleString()}
                </span>
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
                      title={`City inventory status: ${lot.status || "not recorded"}`}
                      className={`shrink-0 rounded px-1 py-px text-[10px] leading-[14px] ${
                        isAvailable(lot) ? "bg-accent-soft font-medium text-accent" : "bg-surface text-faint"
                      }`}
                    >
                      {statusChip(lot.status)}
                    </span>
                    <span className="truncate">{lot.neighborhood}</span>
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
    </aside>
  );
}

export default memo(LeftRail);
