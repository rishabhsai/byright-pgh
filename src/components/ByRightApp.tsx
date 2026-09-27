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
import { RULE_SETS, type Evaluations, type Triages, type TriageInput } from "@/lib/evalCompute";
import { useCityEval } from "@/lib/useCityEval";
import TopBar from "./TopBar";
import LeftRail, { DEFAULT_FILTERS, type Filters, type Tab } from "./LeftRail";
import DetailPanel from "./DetailPanel";
import AboutDrawer from "./AboutDrawer";
import PlanView from "./PlanView";
import PlanReader from "./PlanReader";
import { TYPOLOGIES } from "./verdict";
import { DEFAULT_PROJECTS, financeDiffers, parseUrlState, serializeUrlState, type UrlState } from "./urlState";
import type { HoverInfo, FitBounds } from "./MapView";
import { blockerLine, money, reasonText, verdictLabel } from "./ui/answer";
import { financeGate, NO_COMPS_REASON } from "./ui/financeGate";
import { compsFor, countTriage, DEFAULT_FINANCE, FALLBACK_COMPS, type FinanceAssumptions } from "@/lib/finance";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" />,
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
  /** With a Home type filter: lots where that type passes the use table, and the type's lowercase name. */
  byRightType: number | null;
  typeLabel: string | null;
}

function computeStats(evals: Evaluations, triages: Triages, typIdx: number): Record<RuleSet, RuleSetStats> {
  const s = {} as Record<RuleSet, RuleSetStats>;
  const base = evals["current"].findings.map(countByRight);
  for (const rs of RULE_SETS) {
    let byRightAny = 0,
      byRightPairs = 0,
      variance = 0,
      unknown = 0,
      lotsGaining = 0,
      byRightType = 0;
    evals[rs].best.forEach((v, i) => {
      if (v === "by-right") byRightAny++;
      else if (v === "variance") variance++;
      else if (v === "unknown") unknown++;
      const n = countByRight(evals[rs].findings[i]);
      byRightPairs += n;
      if (n > base[i]) lotsGaining++;
      if (typIdx >= 0 && evals[rs].findings[i][typIdx].verdict === "by-right") byRightType++;
    });
    const typeLabel = typIdx >= 0 ? TYPOLOGY_LABEL[TYPOLOGIES[typIdx]].toLowerCase() : null;
    s[rs] = {
      byRightAny,
      byRightPairs,
      variance,
      unknown,
      lotsGaining,
      triage: countTriage(triages[rs].results),
      byRightType: typIdx >= 0 ? byRightType : null,
      typeLabel,
    };
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

/** URL state (history.replaceState, no router); the codec lives in urlState.ts. */
function readUrl(): UrlState {
  return parseUrlState(window.location.search);
}
function writeUrl(s: UrlState) {
  const q = serializeUrlState(s);
  const url = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", url);
}

/** Assumption edits reach the city-wide triage this long after the last change (or at once on blur). */
const COMMIT_DELAY_MS = 500;
/** The plan rebuilds this long after the last scope or count change, then in an idle callback. */
const PLAN_DEBOUNCE_MS = 150;
const PLAN_IDLE_TIMEOUT_MS = 400;

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
    setFilters((f) => ({
      ...f,
      neighborhoods: u.hoods,
      typology: u.filterType ?? f.typology,
      status: u.status,
      triage: u.triage,
      minArea: u.minArea,
      onlyByRight: u.onlyByRight,
      includeParks: u.includeParks,
    }));
    if (u.reading) setPlanReading(true);
    if (u.projects !== DEFAULT_PROJECTS) setProjects(u.projects);
    // Assumptions and land figures go straight to the committed pass, so the first city-wide run uses them.
    const land = Object.keys(u.land).length ? u.land : null;
    if (land) setLandOverrides(land);
    if (financeDiffers(u.finance)) setAssumptions(u.finance);
    if (land || financeDiffers(u.finance))
      setCommitted((c) => ({ assumptions: financeDiffers(u.finance) ? u.finance : c.assumptions, landOverrides: land ?? c.landOverrides }));
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

  // The triage counts follow the Home type filter, so the use-table count does too.
  const statsTypIdx = cityTypology ? TYPOLOGIES.indexOf(cityTypology) : -1;
  const stats = useMemo(() => (evals && triages ? computeStats(evals, triages, statsTypIdx) : null), [evals, triages, statsTypIdx]);

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
      land: committed.landOverrides,
      status: filters.status,
      triage: filters.triage,
      minArea: filters.minArea,
      onlyByRight: filters.onlyByRight,
      includeParks: filters.includeParks,
      reading: planReading,
    });
  }, [urlRead, lots.length, selectedLot, pickedTypology, filterTypology, filters, ruleSet, tab, projects, committed, planReading]);

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
        // Proforma is not needed here: the triage already carries only screened money.
        const gate = financeGate({ lot: l, finding: pick, evidence: ev, proforma: null });
        if (blocker) {
          const prefix = `${TYPOLOGY_LABEL[pick.typology]}: `;
          line = `${typeName}: ${blocker.text.startsWith(prefix) ? blocker.text.slice(prefix.length) : blocker.text}`;
        } else if (!gate.screened && gate.code !== NO_COMPS_REASON) {
          line = `${says} · not screened: ${gate.reason}`;
        } else {
          const reason = ev ? reasonText(yellowReason(t, ev, l)) : null;
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
  // The empty lot panel follows the neighborhood scope, so the plan is also derived then.
  const planOpen =
    tab === "plan" ||
    planReading ||
    (selectedIdx == null && filters.neighborhoods.length > 0);
  // The plan is derived off the input path: after a short pause and in an idle callback, so typing in the
  // neighborhood picker or the project count never waits on a city-wide rebuild. Until the rebuild lands,
  // the previous plan stays on screen marked stale, and exports stay disabled.
  const planArgs = useMemo(
    () =>
      planOpen && evals && triages && evidence
        ? {
            evals,
            results: triages[ruleSet].results,
            evidence,
            comps: cityComps,
            assumptions: cityAssumptions,
            scope: { neighborhoods: filters.neighborhoods, typology: cityTypology },
            ruleSet,
            projects,
            opts: { sources, landOverrides: cityLandOverrides },
          }
        : null,
    [planOpen, evals, triages, evidence, cityComps, cityAssumptions, filters.neighborhoods, cityTypology, ruleSet, projects, sources, cityLandOverrides],
  );
  const [planState, setPlanState] = useState<{ args: NonNullable<typeof planArgs>; plan: Plan } | null>(null);
  useEffect(() => {
    if (!planArgs) return;
    const a = planArgs;
    let idle: number | null = null;
    const run = () =>
      setPlanState({
        args: a,
        plan: buildPlan(lots, a.evals, a.results, a.evidence, a.comps, a.assumptions, a.scope, a.ruleSet, a.projects, a.opts),
      });
    const ric = typeof window.requestIdleCallback === "function";
    const t = window.setTimeout(() => {
      idle = ric ? window.requestIdleCallback(run, { timeout: PLAN_IDLE_TIMEOUT_MS }) : window.setTimeout(run, 0);
    }, PLAN_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      if (idle != null) {
        if (ric) window.cancelIdleCallback(idle);
        else window.clearTimeout(idle);
      }
    };
  }, [planArgs, lots]);
  const plan = planArgs ? (planState?.plan ?? null) : null;
  const planStale = !!planArgs && planState?.args !== planArgs;

  // Share of inventory records whose district the City zoning map confirms: qualifies inventory-based permission.
  const mapAgreement = useMemo(() => {
    let compared = 0,
      agree = 0;
    for (const l of lots) {
      if (l.zoneAgrees == null) continue;
      compared++;
      if (l.zoneAgrees) agree++;
    }
    return compared ? { agree, compared } : null;
  }, [lots]);

  const retry = useCallback(() => {
    setLoadError(null);
    setLoadAttempt((n) => n + 1);
  }, []);

  return (
    <div className="relative flex h-dvh flex-col overflow-clip">
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
                stale={recomputing || planStale}
                mapAgreement={mapAgreement}
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
                  ? `${stats["bill-2025-1545"].lotsGaining.toLocaleString("en-US")} lots gain an encoded ADU permission result; pick +ADU under Home type to ring them.`
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
                className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-card bg-warning-soft px-card py-3 text-callout text-warning-ink shadow-card"
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
            scope={
              plan && filters.neighborhoods.length > 0
                ? { label: plan.scopeLabel, funnel: plan.funnel }
                : null
            }
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
                stale={recomputing || planStale}
                mapAgreement={mapAgreement}
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
      <div role="alert" className="surface-card w-[360px] p-card">
        <p className="text-title text-ink">{title}</p>
        <p className="mt-1.5 text-callout text-muted">
          {title === "The lot file did not load"
            ? `/data/lots.json could not be read (${reason}). Nothing below is evaluated until it loads. Check the connection and retry.`
            : `Screening results are unavailable (${reason}). Reload to try again.`}
        </p>
        <button
          onClick={onRetry}
          autoFocus
          className="button-primary mt-4"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
