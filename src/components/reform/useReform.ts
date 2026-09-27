"use client";
import { useEffect, useMemo, useState } from "react";
import type { Comps, Lot } from "@/lib/types";
import type { FinanceAssumptions } from "@/lib/finance";
import {
  CUSTOM_ID,
  PRESETS,
  TODAY_PARAMS,
  matchPreset,
  presetById,
  runScenario,
  runLevers,
  screenAll,
  shiftCodes,
  type LeverResult,
  type RuleParams,
  type Screen,
} from "./engine";

/** Param edits reach the city-wide pass this long after the last change. */
export const REFORM_DEBOUNCE_MS = 300;

export interface ReformState {
  /** One row per preset, plus the custom scenario when it matches none. */
  levers: LeverResult[] | null;
  /** The active scenario's result (lags `params` while pending). */
  result: LeverResult | null;
  /** Per lot: 0 unchanged, 1 newly allowed, 2 newly a candidate, 3 lost (see SHIFT_CODE). */
  codes: Uint8Array | null;
  screens: Screen[] | null;
  base: Screen[] | null;
  /** The params `result` and `codes` were computed from. */
  computedFor: RuleParams | null;
  /** The finance inputs `result` was computed from (its cost-screen count is at this $/sf). */
  computedAssumptions: FinanceAssumptions | null;
  /** Today's lots allowed and candidates, from the per-lot screen: the baseline every net is taken against. */
  today: { allowed: number; candidates: number } | null;
  /** True until `result` and `levers` match the current params, lots, comps and assumptions. */
  pending: boolean;
  /** True until the lever table matches the current lots, comps and assumptions. */
  leversPending: boolean;
}

export const scenarioLabel = (params: RuleParams) => {
  const id = matchPreset(params);
  return id === CUSTOM_ID ? "Custom scenario" : (presetById(id)?.label ?? "Custom scenario");
};

export function useReform(
  lots: Lot[],
  comps: (Comps | null)[],
  assumptions: FinanceAssumptions,
  params: RuleParams,
  active: boolean,
): ReformState {
  const [levers, setLevers] = useState<{ lots: Lot[]; comps: (Comps | null)[]; assumptions: FinanceAssumptions; rows: LeverResult[] } | null>(null);
  const [scn, setScn] = useState<{ lots: Lot[]; comps: (Comps | null)[]; assumptions: FinanceAssumptions; params: RuleParams; result: LeverResult; screens: Screen[]; codes: Uint8Array } | null>(null);

  const base = useMemo(() => (active && lots.length ? screenAll(lots, TODAY_PARAMS) : null), [active, lots]);

  // The lever table: every preset, once per lots, comps and assumptions, off the input path.
  useEffect(() => {
    if (!active || !lots.length) return;
    if (levers && levers.lots === lots && levers.comps === comps && levers.assumptions === assumptions) return;
    const t = window.setTimeout(() => setLevers({ lots, comps, assumptions, rows: runLevers(lots, comps, assumptions, PRESETS) }), 50);
    return () => window.clearTimeout(t);
  }, [active, lots, comps, assumptions, levers]);

  // The active scenario: debounced so dragging a knob stays responsive.
  useEffect(() => {
    if (!active || !lots.length || !base) return;
    if (scn && scn.params === params && scn.lots === lots && scn.comps === comps && scn.assumptions === assumptions) return;
    const t = window.setTimeout(
      () => {
        const id = matchPreset(params);
        const result = { ...runScenario(params, lots, comps, assumptions, scenarioLabel(params)), presetId: id };
        const screens = screenAll(lots, params);
        setScn({ lots, comps, assumptions, params, result, screens, codes: shiftCodes(screens, base) });
      },
      scn ? REFORM_DEBOUNCE_MS : 0,
    );
    return () => window.clearTimeout(t);
  }, [active, lots, comps, assumptions, params, base, scn]);

  const rows = useMemo(() => {
    if (!levers) return null;
    const r = scn?.result;
    return r && r.presetId === CUSTOM_ID ? [...levers.rows, r] : levers.rows;
  }, [levers, scn]);

  const today = useMemo(() => {
    if (!base) return null;
    let allowed = 0,
      candidates = 0;
    for (const b of base) {
      if (b.allowed) allowed++;
      if (b.candidate) candidates++;
    }
    return { allowed, candidates };
  }, [base]);

  const fresh = scn && scn.lots === lots ? scn : null;
  const leversFresh = !!levers && levers.lots === lots && levers.comps === comps && levers.assumptions === assumptions;
  return {
    levers: rows,
    result: fresh?.result ?? null,
    codes: fresh?.codes ?? null,
    screens: fresh?.screens ?? null,
    base,
    computedFor: fresh?.params ?? null,
    computedAssumptions: fresh?.assumptions ?? null,
    today,
    pending: !fresh || fresh.params !== params || fresh.comps !== comps || fresh.assumptions !== assumptions,
    leversPending: !leversFresh,
  };
}
