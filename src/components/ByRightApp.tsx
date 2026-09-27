"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { countByRight, evaluateLot } from "@/lib/engine";
import { buildSelectedCase, showsOtherThanBest, type SelectedCase } from "@/lib/selectedCase";
import type { Comps, CompsFile, Finding, Lot, LotsFile, RuleSet, Triage, Typology, Verdict } from "@/lib/types";
import { TYPOLOGY_LABEL } from "@/lib/types";
import { isParkOrGreenway, statusGroup } from "@/lib/ranking";
import { yellowReason, pickFinding, type Evidence } from "@/lib/evidence";
import { buildPlan, type Plan } from "@/lib/plan";
import { acceptedValue, FINANCE_RANGES } from "@/lib/proforma";
import { RULE_SETS, type Evaluations, type Triages, type TriageInput } from "@/lib/evalCompute";
import { useCityEval } from "@/lib/useCityEval";
import TopBar from "./TopBar";
import LeftRail, { DEFAULT_FILTERS, type Filters, type Tab } from "./LeftRail";
import DetailPanel from "./DetailPanel";
import AboutDrawer from "./AboutDrawer";
import PlanView from "./PlanView";
import PlanReader from "./PlanReader";
import { TYPOLOGIES } from "./verdict";
import type { HoverInfo, FitBounds } from "./MapView";
import { blockerLine, money, reasonText, verdictLabel } from "./ui/answer";
import { compsFor, countTriage, DEFAULT_FINANCE, FALLBACK_COMPS, type FinanceAssumptions } from "@/lib/finance";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#e4e6e1]" />,
});

export type { Evaluations, Triages };

export interface RuleSetStats {
  byRightAny: number;
  byRightPairs: number;
  variance: number;
  unknown: number;
  /** Lots with more by-right home types than under today's code. Zero for "current". */
  lotsGaining: number;
  triage: Record<Triage, number>;
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

/**
 * Lots whose outcome differs under the bill: the best verdict (or, with a Home type filter, that
 * type's verdict) or the triage. The only lots the map rings.
 */
function computeChanged(evals: Evaluations, triages: Triages, typIdx: number): boolean[] {
  const verdict = (rs: RuleSet, i: number) => (typIdx < 0 ? evals[rs].best[i] : evals[rs].findings[i][typIdx].verdict);
  const tc = triages.current.results;
  const tb = triages["bill-2025-1545"].results;
  return tc.map((t, i) => verdict("current", i) !== verdict("bill-2025-1545", i) || t.triage !== tb[i].triage);
}

/** One predicate for the list, the map, and the neighborhood fit. */
function lotFilter(filters: Filters, verdicts: Verdict[], triage: Triage[]) {
  const hoods = filters.neighborhoods.length ? new Set(filters.neighborhoods) : null;
  return (l: Lot, i: number) => {
    if (filters.triage && triage[i] !== filters.triage) return false;
    if (hoods && !hoods.has(l.neighborhood)) return false;
    if (filters.minArea && (l.lotAreaSqFt ?? 0) < filters.minArea) return false;
    if (filters.onlyByRight && verdicts[i] !== "by-right") return false;
    if (filters.status && statusGroup(l.status) !== filters.status) return false;
    if (!filters.includeParks && isParkOrGreenway(l.inventoryType)) return false;
    return true;
  };
}

function boundsOf(lots: Lot[], keep: (l: Lot, i: number) => boolean): FitBounds | null {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  lots.forEach((l, i) => {
    if (!keep(l, i)) return;
    w = Math.min(w, l.lon);
    e = Math.max(e, l.lon);
    s = Math.min(s, l.lat);
    n = Math.max(n, l.lat);
  });
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/**
 * URL state (history.replaceState, no router):
 * ?lot=<id>&type=duplex&filterType=townhome&hoods=a,b&scenario=bill&tab=plan&n=12&hc=195
 * `type` is the proposal picked for the selected lot; `filterType` is the Home type filter. Finance
 * assumptions appear only where they differ from the defaults.
 */
interface UrlState {
  lot: string | null;
  /** The proposal picked for the selected lot, when the user picked one. */
  type: Typology | null;
  /** The Home type filter. */
  filterType: Typology | null;
  hoods: string[];
  bill: boolean;
  tab: Tab;
  /** Projects to plan for. */
  projects: number;
  /** Shared finance assumptions (never a lot's land figure). */
  finance: FinanceAssumptions;
}

type RangedKey = keyof typeof FINANCE_RANGES;
/** Short URL keys for the ranged finance inputs. */
const FIN_KEYS: [string, RangedKey][] = [
  ["hc", "hardCostPerSf"],
  ["soft", "softCostPct"],
  ["dev", "devFeePct"],
  ["ret", "targetMarginPct"],
  ["sf", "typicalHomeSf"],
  ["cap", "capRate"],
  ["opex", "opexPct"],
];

const DEFAULT_PROJECTS = 10;

const asTypology = (v: string | null): Typology | null => ((TYPOLOGIES as string[]).includes(v ?? "") ? (v as Typology) : null);

function readUrl(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const finance: FinanceAssumptions = { ...DEFAULT_FINANCE };
  for (const [q, k] of FIN_KEYS) {
    const raw = p.get(q);
    if (raw != null && raw.trim() !== "") finance[k] = acceptedValue(k, Number(raw));
  }
  if (p.get("mode") === "rent") finance.mode = "rent";
  const n = Number(p.get("n"));
  return {
    lot: p.get("lot"),
    type: asTypology(p.get("type")),
    filterType: asTypology(p.get("filterType")),
    hoods: (p.get("hoods") ?? "").split(",").map((h) => h.trim()).filter(Boolean),
    bill: p.get("scenario") === "bill",
    tab: p.get("tab") === "plan" ? "plan" : "lots",
    projects: Number.isInteger(n) && n >= 1 && n <= 9999 ? n : DEFAULT_PROJECTS,
    finance,
  };
}
function writeUrl(s: UrlState) {
  const p = new URLSearchParams();
  if (s.lot) p.set("lot", s.lot);
  if (s.lot && s.type) p.set("type", s.type);
  if (s.filterType) p.set("filterType", s.filterType);
  if (s.hoods.length) p.set("hoods", s.hoods.join(","));
  if (s.bill) p.set("scenario", "bill");
  if (s.tab === "plan") p.set("tab", "plan");
  if (s.projects !== DEFAULT_PROJECTS) p.set("n", String(s.projects));
  for (const [q, k] of FIN_KEYS) if (s.finance[k] !== DEFAULT_FINANCE[k]) p.set(q, String(s.finance[k]));
  if (s.finance.mode !== DEFAULT_FINANCE.mode) p.set("mode", s.finance.mode);
  const q = p.toString().replace(/%2C/g, ",");
  const url = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", url);
}

/** Assumption edits reach the city-wide triage this long after the last change (or at once on blur). */
const COMMIT_DELAY_MS = 500;

export default function ByRightApp() {
  const [file, setFile] = useState<LotsFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [ruleSet, setRuleSet] = useState<RuleSet>("current");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; seq: number } | null>(null);
  const [fitTo, setFitTo] = useState<{ bounds: FitBounds; seq: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // The Plan tab in the wide reading overlay.
  const [planReading, setPlanReading] = useState(false);
  // Live assumptions: the selected lot's case is rebuilt from these on every edit, synchronously.
  const [assumptions, setAssumptions] = useState<FinanceAssumptions>(DEFAULT_FINANCE);
  const [compsFile, setCompsFile] = useState<CompsFile | null>(null);
  const [compsSettled, setCompsSettled] = useState(false);
  // Set when /data/comps.json failed: distinct from a neighborhood with no Zillow series.
  const [compsError, setCompsError] = useState<string | null>(null);
  const [compsAttempt, setCompsAttempt] = useState(0);
  // Projects to plan for: one value for the rail and the reading view.
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [tab, setTab] = useState<Tab>("lots");
  // The home type the user picked for the selected lot while the Home type filter is "Any".
  const [pickedTypology, setPickedTypology] = useState<Typology | null>(null);
  // Acquisition cost the user entered for individual lots; never shared across lots.
  const [landOverrides, setLandOverrides] = useState<Record<string, number>>({});
  // What the city-wide pass runs on: the live assumptions after a pause, or at once on blur.
  const [committed, setCommitted] = useState<{ assumptions: FinanceAssumptions; landOverrides: Record<string, number> }>({
    assumptions: DEFAULT_FINANCE,
    landOverrides: {},
  });
  // Parcel ID from the URL, selected once the lots arrive.
  const pendingLot = useRef<string | null>(null);
  const [urlRead, setUrlRead] = useState(false);

  useEffect(() => {
    const u = readUrl();
    pendingLot.current = u.lot;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore of URL state after hydration */
    if (u.lot && u.type) setPickedTypology(u.type);
    if (u.bill) setRuleSet("bill-2025-1545");
    if (u.tab === "plan") setTab("plan");
    if (u.hoods.length || u.filterType)
      setFilters((f) => ({ ...f, neighborhoods: u.hoods, typology: u.filterType ?? f.typology }));
    if (u.projects !== DEFAULT_PROJECTS) setProjects(u.projects);
    if (FIN_KEYS.some(([, k]) => u.finance[k] !== DEFAULT_FINANCE[k]) || u.finance.mode !== DEFAULT_FINANCE.mode) {
      setAssumptions(u.finance);
      setCommitted((c) => ({ ...c, assumptions: u.finance }));
    }
    setUrlRead(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/lots.json")
      .then((r) => {
        if (!r.ok) throw new Error(`the server answered ${r.status}`);
        return r.json() as Promise<LotsFile>;
      })
      .then((f) => {
        if (cancelled) return;
        if (!f?.lots?.length) throw new Error("the file has no lots");
        setFile(f);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error && e.message ? e.message : "the request failed");
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/comps.json")
      .then((r) => {
        if (!r.ok) throw new Error(`the server answered ${r.status}`);
        return r.json() as Promise<CompsFile>;
      })
      .then((c) => {
        if (cancelled) return;
        if (!c?.byNeighborhood) throw new Error("the file has no neighborhoods");
        setCompsFile(c);
        setCompsError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setCompsFile(null);
        setCompsError(e instanceof Error && e.message ? e.message : "the request failed");
      })
      .finally(() => {
        if (!cancelled) setCompsSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [compsAttempt]);

  const retryComps = useCallback(() => setCompsAttempt((n) => n + 1), []);

  // Commit assumption edits to the city-wide pass after a pause; flushCommit does it at once (on blur).
  useEffect(() => {
    if (committed.assumptions === assumptions && committed.landOverrides === landOverrides) return;
    const t = window.setTimeout(() => setCommitted({ assumptions, landOverrides }), COMMIT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [assumptions, landOverrides, committed]);
  const flushCommit = useCallback(() => {
    setCommitted((c) => (c.assumptions === assumptions && c.landOverrides === landOverrides ? c : { assumptions, landOverrides }));
  }, [assumptions, landOverrides]);
  const commitPending = committed.assumptions !== assumptions || committed.landOverrides !== landOverrides;

  const lots = useMemo(
    () => (file?.lots ?? []).filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon)),
    [file],
  );

  const activeComps = compsFile ?? FALLBACK_COMPS;
  const comps = useMemo<(Comps | null)[]>(() => lots.map((l) => compsFor(l, activeComps)), [activeComps, lots]);

  // With a Home type filter set, every lot is triaged for that one proposal; "Any" uses each lot's best type.
  const filterTypology: Typology | null = filters.typology || null;

  // The city-wide pass runs in a Web Worker. It waits for comps to settle so it runs once on load;
  // later edits re-run triage there. Everything city-wide (map, list, hover, plan) reads the input the
  // worker's published result was computed from, never the live filter or assumptions. The selected
  // lot's case is built locally from the live inputs, so the panel never waits on the worker.
  const triageInput = useMemo<TriageInput | null>(
    () =>
      compsSettled
        ? { comps, assumptions: committed.assumptions, landOverrides: committed.landOverrides, typology: filterTypology }
        : null,
    [compsSettled, comps, committed, filterTypology],
  );
  const city = useCityEval(lots, triageInput);
  const { evals, triages } = city;
  const cityAssumptions = city.input?.assumptions ?? committed.assumptions;
  const cityLandOverrides = city.input?.landOverrides ?? committed.landOverrides;
  const cityComps = city.input?.comps ?? comps;
  const cityTypology: Typology | null = city.input ? city.input.typology : filterTypology;
  const recomputing = commitPending || city.input !== triageInput;

  const evidence = useMemo<Evidence[] | null>(() => city.evidence?.[ruleSet] ?? null, [city.evidence, ruleSet]);

  const sources = useMemo(() => [...(file?.sources ?? []), ...(compsFile?.sources ?? [])], [file, compsFile]);

  const stats = useMemo(() => (evals && triages ? computeStats(evals, triages) : null), [evals, triages]);

  // Time-to-stats, readable as performance.getEntriesByName("byright:stats").
  useEffect(() => {
    if (stats && !performance.getEntriesByName("byright:stats").length) performance.mark("byright:stats");
  }, [stats]);

  const typIdx = cityTypology ? TYPOLOGIES.indexOf(cityTypology) : -1;

  const changed = useMemo(() => (evals && triages ? computeChanged(evals, triages, typIdx) : []), [evals, triages, typIdx]);

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
    const keep = lotFilter(filters, mapVerdicts, mapTriage);
    return lots.map(keep);
  }, [lots, filters, mapVerdicts, mapTriage]);

  // Fit the map to the chosen neighborhoods (or the whole city when cleared).
  const fitHoods = useCallback(
    (f: Filters) => {
      if (!lots.length) return;
      const hoods = new Set(f.neighborhoods);
      const keep = lotFilter(f, mapVerdicts, mapTriage);
      const inHoods = (l: Lot) => !hoods.size || hoods.has(l.neighborhood);
      const b = boundsOf(lots, (l, i) => inHoods(l) && keep(l, i)) ?? boundsOf(lots, inHoods);
      if (b) setFitTo((prev) => ({ bounds: b, seq: (prev?.seq ?? 0) + 1 }));
    },
    [lots, mapVerdicts, mapTriage],
  );

  const onFilters = useCallback(
    (f: Filters) => {
      const hoodsChanged = f.neighborhoods.join("\u0000") !== filters.neighborhoods.join("\u0000");
      setFilters(f);
      if (hoodsChanged) fitHoods(f);
    },
    [filters.neighborhoods, fitHoods],
  );

  const selectFromMap = useCallback((i: number) => {
    setSelectedIdx(i);
    setPickedTypology(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedIdx(null);
    setPickedTypology(null);
    setExpanded(false);
  }, []);
  const selectFromList = useCallback(
    (i: number) => {
      setSelectedIdx(i);
      setPickedTypology(null);
      const l = lots[i];
      setFlyTo((prev) => ({ lon: l.lon, lat: l.lat, seq: (prev?.seq ?? 0) + 1 }));
    },
    [lots],
  );
  const selectById = useCallback(
    (id: string) => {
      const i = lots.findIndex((l) => l.id === id);
      if (i >= 0) selectFromList(i);
    },
    [lots, selectFromList],
  );

  // Restore ?lot= and ?hoods= once the lots are in.
  useEffect(() => {
    if (!urlRead || !lots.length) return;
    const id = pendingLot.current;
    pendingLot.current = null;
    if (id) {
      const i = lots.findIndex((l) => l.id === id);
      if (i >= 0) {
        setSelectedIdx(i);
        setFlyTo({ lon: lots[i].lon, lat: lots[i].lat, seq: 1 });
        return;
      }
    }
    if (filters.neighborhoods.length) {
      const hoods = new Set(filters.neighborhoods);
      const b = boundsOf(lots, (l) => hoods.has(l.neighborhood));
      if (b) setFitTo({ bounds: b, seq: 1 });
    }
    // Runs once per lots array; later neighborhood changes fit through onFilters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRead, lots]);

  const selectedLot = selectedIdx != null ? lots[selectedIdx] : null;

  useEffect(() => {
    if (!urlRead || (pendingLot.current && !lots.length)) return;
    writeUrl({
      lot: selectedLot?.id ?? null,
      type: filterTypology ? null : pickedTypology,
      filterType: filterTypology,
      hoods: filters.neighborhoods,
      bill: ruleSet === "bill-2025-1545",
      tab,
      projects,
      finance: committed.assumptions,
    });
  }, [urlRead, lots.length, selectedLot, pickedTypology, filterTypology, filters.neighborhoods, ruleSet, tab, projects, committed.assumptions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Peel one layer per press: About drawer, then expanded reading mode, then the selection.
        if (aboutOpen) setAboutOpen(false);
        else if (planReading) setPlanReading(false);
        else if (expanded) setExpanded(false);
        else clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aboutOpen, planReading, expanded, clearSelection]);

  // City-wide findings arrive slimmed from the worker; the panel gets the full text for its one lot.
  const selectedFull = useMemo<Record<RuleSet, Finding[]> | null>(
    () => (selectedLot && evals ? { current: evaluateLot(selectedLot, "current"), "bill-2025-1545": evaluateLot(selectedLot, "bill-2025-1545") } : null),
    [selectedLot, evals],
  );
  const selectedLandOverride = selectedLot ? (landOverrides[selectedLot.id] ?? null) : null;

  // The one selected case: proposal, rule set, effective land cost, findings, finance, evidence.
  // Every section of the panel and every export reads from it.
  const selectedCase = useMemo<SelectedCase | null>(
    () =>
      selectedLot && selectedFull && selectedIdx != null
        ? buildSelectedCase({
            lot: selectedLot,
            ruleSet,
            findings: selectedFull,
            comps: comps[selectedIdx],
            assumptions,
            landOverride: selectedLandOverride,
            filterTypology,
            pickedTypology,
          })
        : null,
    [selectedLot, selectedFull, selectedIdx, ruleSet, comps, assumptions, selectedLandOverride, filterTypology, pickedTypology],
  );

  const onTypology = useCallback(
    (t: Typology) => {
      if (filters.typology) setFilters((f) => ({ ...f, typology: t }));
      else setPickedTypology(t);
    },
    [filters.typology],
  );

  const onLandOverride = useCallback(
    (v: number | null) => {
      if (!selectedLot) return;
      const id = selectedLot.id;
      setLandOverrides((m) => {
        if ((m[id] ?? null) === v) return m;
        const next = { ...m };
        if (v == null) delete next[id];
        else next[id] = v;
        return next;
      });
    },
    [selectedLot],
  );

  // Hover card: one line that says why, and which proposal the color is for. It reads the worker's
  // committed input and applies the answer card's blocker rule, so it never shows money the card hides.
  const hoverInfo = useCallback(
    (i: number): HoverInfo | null => {
      const l = lots[i];
      if (!l) return null;
      const t = triages?.[ruleSet].results[i] ?? null;
      const f = evals?.[ruleSet].findings[i] ?? null;
      const ev = evidence?.[i] ?? null;
      if (!t || !f) return { lot: l, triage: null, line: null, note: null };
      const pick = pickFinding(f, t, cityTypology);
      const typeName = `${TYPOLOGY_LABEL[pick.typology]} (${cityTypology ? "Home type filter" : "best type"})`;
      const label = verdictLabel(pick);
      const says = `${typeName}: ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
      let line: string;
      if (t.triage === "gray" || t.triage === "red") {
        line = (t.reasons[0] ?? "").replace(/^(Zoning|Topography): /, "");
      } else {
        const blocker = pick.verdict !== "unknown" ? blockerLine(l, pick.typology, pick, ev) : null;
        if (blocker) {
          const prefix = `${TYPOLOGY_LABEL[pick.typology]}: `;
          line = `${typeName}: ${blocker.text.startsWith(prefix) ? blocker.text.slice(prefix.length) : blocker.text}`;
        } else {
          const reason = ev ? reasonText(yellowReason(t, ev)) : null;
          const money_ = t.pencils
            ? t.margin != null
              ? `~${money(t.margin)} margin at the reference value`
              : null
            : t.gap != null
              ? `~${money(t.gap)} modeled shortfall`
              : null;
          const second = reason === "unknowns to resolve" ? "open items to resolve" : (money_ ?? "finance not checked");
          line = `${says} · ${second}`;
        }
      }
      const sel = selectedCase && selectedIdx === i && selectedCase.typology !== pick.typology ? selectedCase : null;
      const note = sel ? `Panel shows ${TYPOLOGY_LABEL[sel.typology]} (selected).` : null;
      return { lot: l, triage: t.triage, line, note };
    },
    [lots, triages, evals, evidence, ruleSet, cityTypology, selectedCase, selectedIdx],
  );

  // One plan for the rail and the reading view: same count, shortlist, totals and exports.
  const planOpen = tab === "plan" || planReading;
  const plan = useMemo<Plan | null>(
    () =>
      planOpen && evals && triages && evidence
        ? buildPlan(
            lots,
            evals,
            triages[ruleSet].results,
            evidence,
            cityComps,
            cityAssumptions,
            { neighborhoods: filters.neighborhoods, typology: cityTypology },
            ruleSet,
            projects,
            { sources, landOverrides: cityLandOverrides },
          )
        : null,
    [planOpen, lots, evals, triages, evidence, cityComps, cityAssumptions, filters.neighborhoods, cityTypology, ruleSet, projects, sources, cityLandOverrides],
  );

  const retry = useCallback(() => {
    setLoadError(null);
    setLoadAttempt((n) => n + 1);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <TopBar ruleSet={ruleSet} onRuleSet={setRuleSet} stats={stats} onAbout={() => setAboutOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <LeftRail
          lots={lots}
          evals={evals}
          triages={triages}
          ruleSet={ruleSet}
          filters={filters}
          onFilters={onFilters}
          matches={matches}
          selectedIdx={selectedIdx}
          onSelect={selectFromList}
          evidence={evidence}
          typology={cityTypology}
          tab={tab}
          onTab={setTab}
          loading={!loadError && !city.error && !stats}
          onReadPlan={() => {
            setExpanded(false);
            setPlanReading(true);
          }}
          plan={
            plan ? (
              <PlanView
                plan={plan}
                projects={projects}
                onProjects={setProjects}
                ruleSet={ruleSet}
                stale={recomputing}
                onSelect={selectFromList}
              />
            ) : null
          }
        />
        {/* Positioning context for the expanded detail panel, which overlays the map area. */}
        <div className="relative flex min-w-0 flex-1">
          <main className="relative min-w-0 flex-1">
            <MapView
              lots={lots}
              triages={mapTriage}
              matches={matches}
              changed={ruleSet === "bill-2025-1545" && changed.length ? changed : null}
              ringNote={
                ruleSet === "bill-2025-1545" && stats && !filters.typology && stats["bill-2025-1545"].lotsGaining > 0
                  ? `${stats["bill-2025-1545"].lotsGaining.toLocaleString("en-US")} lots gain a backyard unit; pick +ADU under Home type to ring them.`
                  : null
              }
              selectedIdx={selectedIdx}
              onSelect={selectFromMap}
              flyTo={flyTo}
              fitTo={fitTo}
              colorBy={cityTypology}
              ruleSet={ruleSet}
              hoverInfo={hoverInfo}
              loading={!stats && !city.error}
            />
            {loadError && <LoadError reason={loadError} onRetry={retry} />}
            {!loadError && city.error && (
              <LoadError title="The lots could not be evaluated" reason={`the rules engine stopped: ${city.error}`} onRetry={() => window.location.reload()} />
            )}
            {!loadError && compsError && (
              <div
                role="alert"
                className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[#e7c98a] bg-[#fff8e6] px-3 py-2 text-[13px] text-[#6b4a00] shadow-[0_8px_24px_-12px_rgba(23,33,30,.35)]"
              >
                <span>Finance data didn&apos;t load ({compsError}). No lot is assessed for finance until it does.</span>
                <button onClick={retryComps} className="shrink-0 font-medium text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent">
                  Retry
                </button>
              </div>
            )}
          </main>
          <DetailPanel
            key={selectedIdx ?? "empty"}
            selected={selectedCase}
            ruleSet={ruleSet}
            bestNote={
              selectedCase && showsOtherThanBest(selectedCase)
                ? `Showing: ${TYPOLOGY_LABEL[selectedCase.typology]} (${selectedCase.typologySource === "filter" ? "Home type filter" : "selected"}). Best type here: ${TYPOLOGY_LABEL[selectedCase.bestTypology!]}.`
                : null
            }
            onClose={clearSelection}
            onTypology={onTypology}
            onLandOverride={onLandOverride}
            onAssumptions={setAssumptions}
            onCommit={flushCommit}
            compsError={compsError}
            onRetryComps={retryComps}
            recomputing={recomputing}
            expanded={expanded}
            onExpanded={setExpanded}
            stats={city.error ? undefined : (stats?.[ruleSet] ?? null)}
            onSelectId={lots.length ? selectById : undefined}
          />
          {planReading && plan && (
            <PlanReader
              title={`${filters.neighborhoods.length ? filters.neighborhoods.join(", ") : "Citywide"}${cityTypology ? `, ${TYPOLOGY_LABEL[cityTypology]}` : ""}. Scope follows the neighborhood filter.`}
              onClose={() => setPlanReading(false)}
            >
              <PlanView
                layout="reading"
                plan={plan}
                projects={projects}
                onProjects={setProjects}
                ruleSet={ruleSet}
                stale={recomputing}
                onSelect={(i) => {
                  setPlanReading(false);
                  selectFromList(i);
                }}
              />
            </PlanReader>
          )}
        </div>
      </div>
      <AboutDrawer open={aboutOpen} onClose={() => setAboutOpen(false)} file={file} compsFile={activeComps} />
    </div>
  );
}

function LoadError({ title = "The lot file did not load", reason, onRetry }: { title?: string; reason: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/70 backdrop-blur-[2px]">
      <div role="alert" className="w-[360px] rounded-xl border border-hairline bg-panel px-5 py-4 shadow-[0_12px_32px_-12px_rgba(23,33,30,.35)]">
        <p className="font-serif text-[20px] leading-tight text-ink">{title}</p>
        <p className="mt-1.5 text-[13px] leading-5 text-muted">
          {title === "The lot file did not load"
            ? `/data/lots.json could not be read (${reason}). Nothing below is evaluated until it loads. Check the connection and retry.`
            : `Screening results are unavailable (${reason}). Reload to try again.`}
        </p>
        <button
          onClick={onRetry}
          autoFocus
          className="mt-3 inline-flex h-8 items-center rounded-[6px] bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent/90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
