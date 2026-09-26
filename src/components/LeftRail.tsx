"use client";
import { memo, useMemo } from "react";
import type { Lot, RuleSet, Triage, Typology } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { scoreLot, compareTriageRanked, type TriageRanked } from "@/lib/ranking";
import type { Evaluations, Triages } from "./ByRightApp";
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
  neighborhood: string;
  typology: Typology | "";
  onlyByRight: boolean;
  minArea: number;
  triage: Exclude<Triage, "gray"> | "";
}

const TRIAGE_FILTERS: Filters["triage"][] = ["", "green", "yellow", "red"];

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
  const neighborhoods = useMemo(
    () => Array.from(new Set(lots.map((l) => l.neighborhood).filter(Boolean))).sort(),
    [lots],
  );

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

  return (
    <aside className="flex w-[344px] shrink-0 flex-col border-r border-hairline bg-panel">
      <div className="border-b border-hairline px-4 pt-4 pb-3">
        <h2 className="font-serif text-[22px] leading-none">Fast-track finder</h2>
        <p className="mt-1 text-[12px] text-muted">
          Green lots first, then yellow and red. Within a color, most home types by right, then best margin.
        </p>

        <div className="mt-3">
          <span className="mb-1 block text-[11px] text-muted">Triage</span>
          <div role="radiogroup" aria-label="Triage filter" className="grid grid-cols-4 rounded-md border border-hairline bg-surface p-0.5 text-[12px]">
            {TRIAGE_FILTERS.map((t) => (
              <button
                key={t || "any"}
                role="radio"
                aria-checked={filters.triage === t}
                onClick={() => set("triage", t)}
                className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 transition-colors ${
                  filters.triage === t ? "bg-white font-medium text-ink shadow-[0_0_0_1px_rgba(23,33,30,.08)]" : "text-muted hover:text-ink"
                }`}
              >
                {t && <span className="h-2 w-2 rounded-full" style={{ background: TRIAGE_COLOR[t] }} />}
                {t ? TRIAGE_WORD[t] : "Any"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Neighborhood">
            <select
              value={filters.neighborhood}
              onChange={(e) => set("neighborhood", e.target.value)}
              className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px]"
            >
              <option value="">All neighborhoods</option>
              {neighborhoods.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Home type">
            <select
              value={filters.typology}
              onChange={(e) => set("typology", e.target.value as Typology | "")}
              className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px]"
            >
              <option value="">Any type</option>
              {TYPOLOGIES.map((t) => (
                <option key={t} value={t}>
                  {TYPOLOGY_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Min lot area (sf)">
            <input
              type="number"
              min={0}
              step={500}
              value={filters.minArea || ""}
              placeholder="0"
              onChange={(e) => set("minArea", Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-[12px] tabular-nums"
            />
          </Field>
          <label className="flex cursor-pointer items-end gap-2 pb-1.5 text-[12px] text-ink select-none">
            <input
              type="checkbox"
              checked={filters.onlyByRight}
              onChange={(e) => set("onlyByRight", e.target.checked)}
              className="h-4 w-4 accent-[var(--v-byright)]"
            />
            Only by-right
          </label>
        </div>
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
                onClick={() => set("neighborhood", filters.neighborhood === h.name ? "" : h.name)}
                className={`group relative flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[12px] ${
                  filters.neighborhood === h.name ? "bg-accent-soft" : "hover:bg-surface"
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
            <span key={t} title={TYPOLOGY_LABEL[t]} className="w-3 text-center">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

export default memo(LeftRail);
