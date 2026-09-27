import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCE } from "@/lib/proforma";
import { BILL_PARAMS, TODAY_PARAMS } from "@/lib/rules";
import { PRESETS } from "@/lib/levers";
import { applyAll, chipLabel, compactAskState, scenarioOf, undoApplied, type AskState } from "./apply";

const START: AskState = {
  neighborhoods: [],
  homeType: "",
  status: "",
  triage: "",
  ruleSet: "current",
  tab: "lots",
  reform: { presetId: "today", params: TODAY_PARAMS },
  finance: DEFAULT_FINANCE,
  lotId: null,
};
const L1800 = PRESETS.find((p) => p.id === "min-lot-L-1800")!;

describe("applyAll", () => {
  it("applies filters and a lever, and labels each change as a chip", () => {
    const { state, applied } = applyAll(START, [
      { tool: "set_scenario", preset: "min-lot-L-1800" },
      { tool: "set_neighborhoods", names: ["Hazelwood"] },
      { tool: "set_home_type", type: "duplex" },
    ]);
    expect(state).toMatchObject({ neighborhoods: ["Hazelwood"], homeType: "duplex", tab: "reform", reform: { presetId: "min-lot-L-1800", params: L1800.params } });
    expect(applied.map((a) => chipLabel(a))).toEqual(["Scenario: Minimum lot size L 3,000 → 1,800", "Neighborhoods: Hazelwood", "Home type: Duplex"]);
  });

  it("names the housing bill on the Lots tab without leaving it", () => {
    const { state, applied } = applyAll(START, [{ tool: "set_scenario", preset: "bill-2025-1545" }]);
    expect(state).toMatchObject({ ruleSet: "bill-2025-1545", tab: "lots", reform: { presetId: "bill-2025-1545", params: BILL_PARAMS } });
    expect(scenarioOf(state)).toEqual({ params: BILL_PARAMS, label: "Bill 2025-1545 (substitute)" });
    expect(chipLabel(applied[0])).toBe("Scenario: Bill 2025-1545 (substitute)");
  });

  it("merges rule params into the scenario and matches a named lever when they equal one", () => {
    const { state, applied } = applyAll(START, [{ tool: "set_rule_params", params: { minLotArea: { L: 1800 } } }]);
    expect(state.reform.presetId).toBe("min-lot-L-1800");
    expect(chipLabel(applied[0])).toBe("Scenario: Minimum lot size L 3,000 → 1,800");
    const custom = applyAll(START, [{ tool: "set_rule_params", params: { minLotArea: { L: 2000 }, twoUnitInR1: true } }]);
    expect(custom.state.reform.presetId).toBe("custom");
    expect(scenarioOf(custom.state).label).toBe("Custom scenario");
    expect(chipLabel(custom.applied[0])).toBe("Scenario: Minimum lot size L 3,000 → 2,000; Two-unit by right in R1D/R1A: off → on");
  });

  it("maps status and finance to the app's own values", () => {
    const { state, applied } = applyAll(START, [
      { tool: "set_status", status: "for-sale" },
      { tool: "set_finance", finance: { hardCostPerSf: 250, targetMarginPct: 15 } },
    ]);
    expect(state.status).toBe("Available for Sale");
    expect(state.finance).toMatchObject({ hardCostPerSf: 250, targetMarginPct: 15, siteCostPerProject: DEFAULT_FINANCE.siteCostPerProject });
    expect(applied.map((a) => chipLabel(a))).toEqual(["Status: Available for Sale", "Hard cost: $225 → $250/sf; Target return: 10% → 15%"]);
  });

  it("skips a lot query with no match and records no change for explain", () => {
    const { state, applied } = applyAll(START, [
      { tool: "select_lot", query: "1 Nowhere St", lotId: null },
      { tool: "explain", topic: "green-policy" },
    ]);
    expect(state).toEqual(START);
    expect(applied.map((a) => [chipLabel(a), a.changed])).toEqual([
      ["Lot: no match for “1 Nowhere St”", []],
      ["Explain: what Green requires", []],
    ]);
  });
});

describe("undoApplied", () => {
  it("restores only the state the one action changed", () => {
    const { state, applied } = applyAll(START, [
      { tool: "set_scenario", preset: "min-lot-L-1800" },
      { tool: "set_neighborhoods", names: ["Hazelwood"] },
      { tool: "set_home_type", type: "duplex" },
    ]);
    const undone = undoApplied(state, applied[0]);
    expect(undone).toMatchObject({ neighborhoods: ["Hazelwood"], homeType: "duplex", tab: "lots", reform: { presetId: "today" } });
    expect(undoApplied(undone, applied[2]).homeType).toBe("");
  });
});

describe("compactAskState", () => {
  it("sends the model the view in tool vocabulary and never the open lot", () => {
    const s: AskState = { ...START, neighborhoods: ["Larimer"], status: "Available for Sale", ruleSet: "bill-2025-1545", lotId: "0077S00123000000" };
    expect(compactAskState(s)).toEqual({
      neighborhoods: ["Larimer"],
      homeType: "any",
      status: "for-sale",
      triage: "any",
      scenario: "bill-2025-1545",
      tab: "lots",
      finance: { hardCostPerSf: 225, siteCostPerProject: 35_000, targetMarginPct: 10, mode: "sale" },
    });
  });
});
