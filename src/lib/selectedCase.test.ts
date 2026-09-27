import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompsFile, LotsFile, RuleSet, Finding } from "./types";
import { evaluateLot } from "./rules";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { buildApplicationPlan } from "./application";
import { buildSelectedCase } from "./selectedCase";
import { answerHeadline, blockerLine } from "@/components/ui/answer";

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

  it("carries the shared first open item: the district for 0 Old Kirkpatrick St, the shortfall for a Hazelwood lot", () => {
    expect(caseFor("0011F00200000000", null).firstOpenItem).toEqual({ id: "district-conflict", label: "Resolve district: inventory R2-VH vs map UPR-B" });
    expect(caseFor("0056N00203000000", null).firstOpenItem).toEqual({ id: "finance", label: "Financing review (modeled shortfall $301,863)" });
  });

  it("applies the lot's land figure to finance and to the application description", () => {
    const c = caseFor("0056N00203000000", null, 0);
    expect(c.proforma?.landSource).toBe("override");
    expect(c.typology).toBe("townhome"); // 19.5 ft lot: the attached prototype
    expect(Math.round(c.proforma!.totalCost)).toBe(349_650);
    const plan = buildApplicationPlan(c.lot, c.findings.current, "current", c.triage, c.proforma, c.comps, c.typology);
    expect(plan.description).toContain("$349,650");
  });

  it("a typology switch rebuilds headline, triage, evidence and finance from the same proposal (126 Carrington)", () => {
    const id = "0023F00165000000";
    const head = (c: ReturnType<typeof caseFor>) => answerHeadline(c.triage, c.finding, c.proforma, c.lot).text;
    const state = (c: ReturnType<typeof caseFor>, check: string) => c.evidence.checks.find((x) => x.id === check)?.state;

    const any = caseFor(id, null);
    expect(any.triage.triage).toBe("green");
    expect(head(any)).toMatch(/^Passes the screen/);
    expect(state(any, "use")).toBe("pass");
    expect(state(any, "finance")).toBe("pass");

    const duplex = caseFor(id, "duplex");
    expect(duplex.typology).toBe("duplex");
    expect(duplex.finding?.typology).toBe("duplex");
    expect(duplex.finding?.verdict).toBe("prohibited");
    // Every part of the case describes the duplex: no Green, no passing Use, no passing Finance.
    expect(duplex.triage.triage).not.toBe("green");
    expect(head(duplex)).not.toMatch(/^Passes the screen/);
    expect(state(duplex, "use")).toBe("fail");
    expect(state(duplex, "finance")).not.toBe("pass");
    expect(blockerLine(duplex.lot, duplex.typology, duplex.finding, duplex.evidence)?.text).toBe("Duplex: not allowed here (use)");

    // Switching back leaves no residue from the duplex.
    const back = caseFor(id, null);
    expect(head(back)).toBe(head(any));
    expect(back.evidence).toEqual(any.evidence);
    expect(back.triage).toEqual(any.triage);
  });
});
