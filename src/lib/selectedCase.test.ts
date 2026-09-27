import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompsFile, LotsFile, RuleSet, Finding } from "./types";
import { evaluateLot } from "./rules";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { buildApplicationPlan } from "./application";
import { buildSelectedCase } from "./selectedCase";
import { answerHeadline, blockerLine } from "@/components/ui/answer";

/** The finance default before the mentors' Sept 26 guidance: $185/sf, no site-work line. */
const PRIOR_DEFAULT = { ...DEFAULT_FINANCE, hardCostPerSf: 185, siteCostPerProject: 0 };

const haveData = existsSync("public/data/lots.json") && existsSync("public/data/comps.json");

describe.skipIf(!haveData)("selected case", () => {
  const lots = haveData ? (JSON.parse(readFileSync("public/data/lots.json", "utf8")) as LotsFile).lots : [];
  const comps = haveData ? (JSON.parse(readFileSync("public/data/comps.json", "utf8")) as CompsFile) : null;
  const caseFor = (id: string, picked: Parameters<typeof buildSelectedCase>[0]["pickedTypology"], landOverride: number | null = null, assumptions = DEFAULT_FINANCE) => {
    const lot = lots.find((l) => l.id === id)!;
    const findings = { current: evaluateLot(lot, "current"), "bill-2025-1545": evaluateLot(lot, "bill-2025-1545") } as Record<RuleSet, Finding[]>;
    return buildSelectedCase({
      lot,
      ruleSet: "current",
      findings,
      comps: compsFor(lot, comps),
      assumptions,
      landOverride,
      filterTypology: null,
      pickedTypology: picked,
    });
  };

  it("follows the picked proposal: a Green Monterey lot switched to Duplex is no longer Green", () => {
    // No lot is Green at the default $225/sf plus $35,000 site work; the prior default ($185/sf, no site cost) has Green lots.
    const best = caseFor("0023E00094000000", null, null, PRIOR_DEFAULT);
    expect(best.triage.triage).toBe("green");
    expect(best.typology).toBe(best.bestTypology);
    const duplex = caseFor("0023E00094000000", "duplex", null, PRIOR_DEFAULT);
    expect(duplex.typology).toBe("duplex");
    expect(duplex.typologySource).toBe("picked");
    expect(duplex.triage.triage).not.toBe("green");
    expect(duplex.finding?.typology).toBe("duplex");
    expect(duplex.bestTypology).toBe(best.typology);
  });

  it("carries the shared first open item: the district for 0 Old Kirkpatrick St, the shortfall for a Hazelwood lot", () => {
    expect(caseFor("0011F00200000000", null).firstOpenItem).toEqual({ id: "district-conflict", label: "Resolve district: inventory R2-VH vs map UPR-B" });
    expect(caseFor("0056N00203000000", null).firstOpenItem).toEqual({ id: "finance", label: "Financing review (modeled shortfall $423,523)" });
  });

  it("applies the lot's land figure to finance and to the application description", () => {
    const c = caseFor("0056N00203000000", null, 0);
    expect(c.proforma?.landSource).toBe("override");
    expect(c.typology).toBe("townhome"); // 19.5 ft lot: the attached prototype
    // 1,400 sf × $225 × 1.35 = $425,250, plus $35,000 site work, $0 land
    expect(Math.round(c.proforma!.totalCost)).toBe(460_250);
    const plan = buildApplicationPlan(c.lot, c.findings.current, "current", c.triage, c.proforma, c.comps, c.typology);
    expect(plan.description).toContain("$460,250");
  });

  it("a typology switch rebuilds headline, triage, evidence and finance from the same proposal (126 Carrington)", () => {
    const id = "0023F00165000000";
    const head = (c: ReturnType<typeof caseFor>) => answerHeadline(c.triage, c.finding, c.proforma, c.lot).text;
    const state = (c: ReturnType<typeof caseFor>, check: string) => c.evidence.checks.find((x) => x.id === check)?.state;

    const any = caseFor(id, null, null, PRIOR_DEFAULT);
    expect(any.triage.triage).toBe("green");
    expect(head(any)).toMatch(/^Passes the screen/);
    expect(state(any, "use")).toBe("pass");
    expect(state(any, "finance")).toBe("pass");

    const duplex = caseFor(id, "duplex", null, PRIOR_DEFAULT);
    expect(duplex.typology).toBe("duplex");
    expect(duplex.finding?.typology).toBe("duplex");
    expect(duplex.finding?.verdict).toBe("prohibited");
    // Every part of the case describes the duplex: no Green, no passing Use, no passing Finance.
    expect(duplex.triage.triage).not.toBe("green");
    expect(head(duplex)).not.toMatch(/^Passes the screen/);
    expect(state(duplex, "use")).toBe("fail");
    expect(state(duplex, "finance")).not.toBe("pass");
    expect(blockerLine(duplex.lot, duplex.typology, duplex.finding, duplex.evidence)?.text).toBe("Duplex: not allowed here (use)");

    // No money for a prohibited proposal: not in the case, so not in the memo or the packet.
    expect(duplex.finance).toEqual({ screened: false, reason: "use not permitted", proforma: null });
    expect(duplex.proforma).toBeNull();
    expect(any.finance.screened).toBe(true);
    expect(any.proforma).toBe(any.finance.proforma);

    // Switching back leaves no residue from the duplex.
    const back = caseFor(id, null, null, PRIOR_DEFAULT);
    expect(head(back)).toBe(head(any));
    expect(back.evidence).toEqual(any.evidence);
    expect(back.triage).toEqual(any.triage);
  });

  it("0 Warren St (Hillside exception): figures are a labeled hypothetical, never the case's screened proforma", () => {
    const c = caseFor("0046S00371000000", null);
    expect(c.typology).toBe("single");
    expect(c.finance.screened).toBe(false);
    expect(c.finance.reason).toBe("permission unresolved");
    expect(c.finance.proforma).not.toBeNull();
    expect(c.proforma).toBeNull();
    expect(c.triage.gap).toBeNull();
    const plan = buildApplicationPlan(c.lot, c.findings.current, "current", c.triage, c.finance.proforma, c.comps, c.typology);
    expect(plan.description).not.toMatch(/\$/);
  });
});
