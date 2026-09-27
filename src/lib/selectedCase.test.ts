import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompsFile, LotsFile, RuleSet, Finding } from "./types";
import { evaluateLot } from "./rules";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { buildApplicationPlan } from "./application";
import { buildSelectedCase } from "./selectedCase";

const haveData = existsSync("public/data/lots.json") && existsSync("public/data/comps.json");

describe.skipIf(!haveData)("selected case", () => {
  const lots = haveData ? (JSON.parse(readFileSync("public/data/lots.json", "utf8")) as LotsFile).lots : [];
  const comps = haveData ? (JSON.parse(readFileSync("public/data/comps.json", "utf8")) as CompsFile) : null;
  const caseFor = (id: string, picked: Parameters<typeof buildSelectedCase>[0]["pickedTypology"], landOverride: number | null = null) => {
    const lot = lots.find((l) => l.id === id)!;
    const findings = { current: evaluateLot(lot, "current"), "bill-2025-1545": evaluateLot(lot, "bill-2025-1545") } as Record<RuleSet, Finding[]>;
    return buildSelectedCase({
      lot,
      ruleSet: "current",
      findings,
      comps: compsFor(lot, comps),
      assumptions: DEFAULT_FINANCE,
      landOverride,
      filterTypology: null,
      pickedTypology: picked,
    });
  };

  it("follows the picked proposal: a Green Monterey lot switched to Duplex is no longer Green", () => {
    const best = caseFor("0023E00094000000", null);
    expect(best.triage.triage).toBe("green");
    expect(best.typology).toBe(best.bestTypology);
    const duplex = caseFor("0023E00094000000", "duplex");
    expect(duplex.typology).toBe("duplex");
    expect(duplex.typologySource).toBe("picked");
    expect(duplex.triage.triage).not.toBe("green");
    expect(duplex.finding?.typology).toBe("duplex");
    expect(duplex.bestTypology).toBe(best.typology);
  });

  it("applies the lot's land figure to finance and to the application description", () => {
    const c = caseFor("0056N00203000000", null, 0);
    expect(c.proforma?.landSource).toBe("override");
    expect(Math.round(c.proforma!.totalCost)).toBe(299_700);
    const plan = buildApplicationPlan(c.lot, c.findings.current, "current", c.triage, c.proforma, c.comps, c.typology);
    expect(plan.description).toContain("$299,700");
  });
});
