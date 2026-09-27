import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Check, Finding, LotsFile } from "@/lib/types";
import { evaluateLot } from "@/lib/rules";
import { approvalOf, filingHeadline } from "./approval";

const cite = { ruleSet: "current", section: "§ 911.02", title: "", url: "" } as unknown as Check["citation"];
const check = (id: string, passed: boolean | null, note?: string): Check => ({ id, label: id, passed, measured: null, required: null, citation: cite, note });
const f = (verdict: Finding["verdict"], reviewKind: Finding["reviewKind"], checks: Check[] = []) => ({ verdict, reviewKind, checks });
const agrees = { zoneAgrees: true, zoneMap: "R1D-L" };

describe("filing headline from the approval kind", () => {
  it("names the route and never a likelihood", () => {
    expect(filingHeadline(3, approvalOf(f("by-right", null), agrees))).toBe("3 filings · staff zoning review");
    expect(filingHeadline(3, approvalOf(f("review", "administrator"), agrees))).toBe("3 filings · administrator exception (staff)");
    expect(filingHeadline(4, approvalOf(f("review", "special"), agrees))).toBe("4 filings · special exception (Board hearing)");
    const relief = approvalOf(f("variance", null, [check("lot-area", false)]), agrees);
    expect(relief.phrase).toBe("relief needed (variance or § 921.04)");
    for (const a of [relief, approvalOf(f("review", "special"), agrees)]) expect(a.phrase).not.toMatch(/likely|no hearing/i);
  });

  it("does not answer an administrator exception as a variance or special exception", () => {
    const a = approvalOf(f("review", "administrator"), agrees);
    expect(a.formAnswer).toMatch(/^No variance or special exception/);
    expect(a.formAnswer).toMatch(/administrator exception/);
  });

  it("keeps unresolved permission unresolved: district, width, ADU overlay", () => {
    expect(approvalOf(f("by-right", null), { zoneAgrees: false, zoneMap: "R1D-L" }).phrase).toBe("permission unresolved: confirm the zoning district first");
    const width = f("review", "special", [check("use", null, "Frontage not in inventory (needs survey); by right only if lot width is 16 ft or less.")]);
    expect(approvalOf(width, agrees).phrase).toBe("permission unresolved: confirm the lot width first");
    const overlay = f("prohibited", null, [
      check("use", false, "ADUs are allowed only inside an adopted ADU Overlay District; This prototype has no overlay layer and assumes the lot is outside one."),
    ]);
    expect(approvalOf(overlay, agrees).phrase).toBe("permission unresolved: confirm the ADU overlay first");
    expect(approvalOf(f("unknown", null, [check("use", null, "Frontage not in inventory (needs survey); by right only if lot width is 16 ft or less.")]), agrees).kind).toBe("unresolved");
  });
});

const haveData = existsSync("public/data/lots.json");

describe.skipIf(!haveData)("approval on the audit's parcels", () => {
  const lots = haveData ? (JSON.parse(readFileSync("public/data/lots.json", "utf8")) as LotsFile).lots : [];
  const of = (id: string, t: Finding["typology"]) => {
    const lot = lots.find((l) => l.id === id)!;
    return approvalOf(evaluateLot(lot, "current").find((x) => x.typology === t)!, lot);
  };
  it("Warren St house: administrator exception, not a variance answer", () => {
    expect(of("0046S00371000000", "single").kind).toBe("administrator");
  });
  it("1978 Montier St townhouse with no frontage: width first, not Board approval", () => {
    expect(of("0232D00175000000", "townhome").phrase).toBe("permission unresolved: confirm the lot width first");
  });
  it("126 Carrington townhouse: staff zoning review", () => {
    expect(of("0023F00165000000", "townhome").kind).toBe("by-right");
  });
});
