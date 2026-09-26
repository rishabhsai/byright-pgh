"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { evaluateLot, bestVerdict, countByRight } from "@/lib/engine";
import { FIXTURE_LOTS } from "@/lib/fixtures";
import type { Comps, CompsFile, Finding, Lot, LotsFile, RuleSet, Triage, TriageResult, Verdict } from "@/lib/types";
import TopBar from "./TopBar";
import LeftRail, { DEFAULT_FILTERS, type Filters } from "./LeftRail";
import DetailPanel from "./DetailPanel";
import AboutDrawer from "./AboutDrawer";
import { TYPOLOGIES } from "./verdict";
import {
  compsFor,
  countTriage,
  DEFAULT_FINANCE,
  FALLBACK_COMPS,
  triageLot,
  type FinanceAssumptions,
} from "@/lib/finance";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#e4e6e1]" />,
});

export type Evaluations = Record<RuleSet, { findings: Finding[][]; best: Verdict[] }>;

export type Triages = Record<RuleSet, { results: TriageResult[]; margin: (number | null)[] }>;

export type ColorMode = "triage" | "verdict";

export interface RuleSetStats {
  byRightAny: number;
  byRightPairs: number;
  variance: number;
  unknown: number;
  /** Lots with more by-right home types than under today's code. Zero for "current". */
  lotsGaining: number;
  triage: Record<Triage, number>;
}

const RULE_SETS: RuleSet[] = ["current", "bill-2025-1545"];

export interface ByRightAppProps {
  /** Hook for an AI memo endpoint. Receives the lot and findings under the active rule set. */
  onGenerateMemo?: (lot: Lot, findings: Finding[], ruleSet: RuleSet) => Promise<string>;
}

function evaluateAll(lots: Lot[]): Evaluations {
  const t0 = performance.now();
  const out = {} as Evaluations;
  for (const rs of RULE_SETS) {
    const findings = lots.map((l) => evaluateLot(l, rs));
    out[rs] = { findings, best: findings.map((f) => bestVerdict(f)) };
  }
  console.info(
    `[byright] evaluated ${lots.length} lots × ${TYPOLOGIES.length} typologies × 2 rule sets in ${Math.round(performance.now() - t0)} ms`,
  );
  return out;
}

function computeStats(evals: Evaluations, triages: Triages): Record<RuleSet, RuleSetStats> {
  const s = {} as Record<RuleSet, RuleSetStats>;
  const base = evals["current"].findings.map(countByRight);
  for (const rs of RULE_SETS) {
    let byRightAny = 0,
      byRightPairs = 0,
      variance = 0,
      unknown = 0,
      lotsGaining = 0;
    evals[rs].best.forEach((v, i) => {
      if (v === "by-right") byRightAny++;
      else if (v === "variance") variance++;
      else if (v === "unknown") unknown++;
      const n = countByRight(evals[rs].findings[i]);
      byRightPairs += n;
      if (n > base[i]) lotsGaining++;
    });
    s[rs] = { byRightAny, byRightPairs, variance, unknown, lotsGaining, triage: countTriage(triages[rs].results) };
  }
  return s;
}

function computeChanged(evals: Evaluations): boolean[] {
  const bill = evals["bill-2025-1545"].findings;
  return evals["current"].findings.map((f, i) => f.some((x, j) => x.verdict !== bill[i][j]?.verdict));
}

export default function ByRightApp({ onGenerateMemo }: ByRightAppProps = {}) {
  const [file, setFile] = useState<LotsFile | null>(null);
  const [usingFixtures, setUsingFixtures] = useState(false);
  const [ruleSet, setRuleSet] = useState<RuleSet>("current");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; seq: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [assumptions, setAssumptions] = useState<FinanceAssumptions>(DEFAULT_FINANCE);
  const [compsFile, setCompsFile] = useState<CompsFile | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("triage");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/lots.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<LotsFile>;
      })
      .then((f) => {
        if (cancelled) return;
        if (!f?.lots?.length) throw new Error("empty");
        setFile(f);
      })
      .catch(() => {
        if (cancelled) return;
        setFile(FIXTURE_LOTS);
        setUsingFixtures(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/comps.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<CompsFile>;
      })
      .then((c) => {
        if (!cancelled) setCompsFile(c?.byNeighborhood ? c : null);
      })
      .catch(() => {
        if (!cancelled) setCompsFile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lots = useMemo(
    () => (file?.lots ?? []).filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon)),
    [file],
  );

  const evals = useMemo<Evaluations | null>(() => (lots.length ? evaluateAll(lots) : null), [lots]);

  const activeComps = compsFile ?? FALLBACK_COMPS;
  const comps = useMemo<(Comps | null)[]>(() => lots.map((l) => compsFor(l, activeComps)), [activeComps, lots]);

  // The city-wide triage re-runs a pro forma for every lot, so it follows a deferred copy of the
  // assumptions: the detail panel reads `assumptions` directly and stays responsive while this catches up.
  const cityAssumptions = useDeferredValue(assumptions);
  const recomputing = cityAssumptions !== assumptions;

  const triages = useMemo<Triages | null>(() => {
    if (!evals) return null;
    const out = {} as Triages;
    for (const rs of RULE_SETS) {
      const results = lots.map((l, i) => triageLot(l, evals[rs].findings[i], comps[i], cityAssumptions));
      out[rs] = { results, margin: results.map((t) => t.margin) };
    }
    return out;
  }, [evals, lots, comps, cityAssumptions]);

  const stats = useMemo(() => (evals && triages ? computeStats(evals, triages) : null), [evals, triages]);
  const changed = useMemo(() => (evals ? computeChanged(evals) : []), [evals]);

  const typIdx = filters.typology ? TYPOLOGIES.indexOf(filters.typology) : -1;

  const mapVerdicts = useMemo<Verdict[]>(() => {
    if (!evals) return [];
    const e = evals[ruleSet];
    return typIdx < 0 ? e.best : e.findings.map((f) => f[typIdx].verdict);
  }, [evals, ruleSet, typIdx]);

  const mapTriage = useMemo<Triage[]>(
    () => (triages ? triages[ruleSet].results.map((t) => t.triage) : []),
    [triages, ruleSet],
  );

  const matches = useMemo<boolean[]>(() => {
    const hoods = filters.neighborhoods.length ? new Set(filters.neighborhoods) : null;
    return lots.map((l, i) => {
      if (filters.triage && mapTriage[i] !== filters.triage) return false;
      if (hoods && !hoods.has(l.neighborhood)) return false;
      if (filters.minArea && (l.lotAreaSqFt ?? 0) < filters.minArea) return false;
      if (filters.onlyByRight && mapVerdicts[i] !== "by-right") return false;
      return true;
    });
  }, [lots, filters, mapVerdicts, mapTriage]);

  const selectFromMap = useCallback((i: number) => setSelectedIdx(i), []);
  const clearSelection = useCallback(() => {
    setSelectedIdx(null);
    setExpanded(false);
  }, []);
  const selectFromList = useCallback(
    (i: number) => {
      setSelectedIdx(i);
      const l = lots[i];
      setFlyTo((prev) => ({ lon: l.lon, lat: l.lat, seq: (prev?.seq ?? 0) + 1 }));
    },
    [lots],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Peel one layer per press: About drawer, then expanded reading mode, then the selection.
        if (aboutOpen) setAboutOpen(false);
        else if (expanded) setExpanded(false);
        else clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aboutOpen, expanded, clearSelection]);

  const selectedLot = selectedIdx != null ? lots[selectedIdx] : null;

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        ruleSet={ruleSet}
        onRuleSet={setRuleSet}
        stats={stats}
        onAbout={() => setAboutOpen(true)}
        usingFixtures={usingFixtures}
      />
      <div className="flex min-h-0 flex-1">
        <LeftRail
          lots={lots}
          evals={evals}
          triages={triages}
          ruleSet={ruleSet}
          filters={filters}
          onFilters={setFilters}
          matches={matches}
          selectedIdx={selectedIdx}
          onSelect={selectFromList}
        />
        {/* Positioning context for the expanded detail panel, which overlays the map area. */}
        <div className="relative flex min-w-0 flex-1">
          <main className="relative min-w-0 flex-1">
            <MapView
              lots={lots}
              verdicts={mapVerdicts}
              triages={mapTriage}
              colorMode={colorMode}
              onColorMode={setColorMode}
              matches={matches}
              changed={ruleSet === "bill-2025-1545" && !filters.typology ? changed : null}
              selectedIdx={selectedIdx}
              onSelect={selectFromMap}
              flyTo={flyTo}
              colorBy={filters.typology || null}
              ruleSet={ruleSet}
            />
          </main>
          <DetailPanel
            key={selectedIdx ?? "empty"}
            lot={selectedLot}
            ruleSet={ruleSet}
            findings={selectedIdx != null && evals ? evals[ruleSet].findings[selectedIdx] : null}
            findingsCurrent={selectedIdx != null && evals ? evals.current.findings[selectedIdx] : null}
            findingsBill={selectedIdx != null && evals ? evals["bill-2025-1545"].findings[selectedIdx] : null}
            onClose={clearSelection}
            triage={selectedIdx != null && triages ? triages[ruleSet].results[selectedIdx] : null}
            comps={selectedIdx != null ? comps[selectedIdx] : null}
            assumptions={assumptions}
            onAssumptions={setAssumptions}
            recomputing={recomputing}
            expanded={expanded}
            onExpanded={setExpanded}
            onGenerateMemo={onGenerateMemo}
          />
        </div>
      </div>
      <AboutDrawer
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        file={file}
        compsFile={activeComps}
        usingFixtures={usingFixtures}
      />
    </div>
  );
}
