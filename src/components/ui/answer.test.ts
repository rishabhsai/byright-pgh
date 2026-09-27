import { describe, expect, it } from "vitest";
import type { Lot, TriageResult } from "@/lib/types";
import { evaluateLot } from "@/lib/rules";
import { answerHeadline, typologyPhrase, verdictLabel, whatWouldChange } from "./answer";

function lot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: "0021N00315000000",
    address: "1 Test St",
    neighborhood: "Test",
    councilDistrict: "1",
    ward: "1",
    lat: 40.44,
    lon: -79.99,
    zone: "R2-M",
    lotAreaSqFt: 3000,
    frontageFt: 25,
    landValue: 1000,
    status: "Available for Sale",
    inventoryType: "Public Sale",
    hazards: { steepSlope: false, undermined: false, floodZone: false },
    ...overrides,
  };
}

const findingOf = (l: Lot, t: Parameters<typeof typologyPhrase>[0]) => evaluateLot(l, "current").find((f) => f.typology === t)!;

describe("verdictLabel", () => {
  it("keeps the approval route: administrator exception is staff approval, special exception is Board approval", () => {
    const big = lot({ zone: "H", lotAreaSqFt: 43045, frontageFt: 198 });
    expect(verdictLabel(findingOf(big, "single"))).toBe("Staff approval (administrator exception)");
    expect(verdictLabel(findingOf(big, "townhome"))).toBe("Board approval (special exception)");
  });

  it("names relief without promising a hearing, and keeps a use approval that survives the relief", () => {
    expect(verdictLabel(findingOf(lot({ lotAreaSqFt: 1860 }), "single"))).toBe("Relief needed (variance or § 921.04 exception)");
    expect(verdictLabel(findingOf(lot({ zone: "H", lotAreaSqFt: 2000 }), "single"))).toBe(
      "Relief needed (variance or § 921.04 exception) + staff approval (administrator exception)",
    );
  });

  it("an FAR-only failure asks for a smaller building or a variance, not a § 921.04 exception", () => {
    expect(verdictLabel(findingOf(lot({ zone: "LNC", lotAreaSqFt: 259 }), "triplex"))).toBe("Relief needed (smaller building or variance)");
  });

  it("labels the plain verdicts", () => {
    expect(verdictLabel(findingOf(lot(), "single"))).toBe("Allowed by use table");
    expect(verdictLabel(findingOf(lot({ zone: "R1D-H" }), "duplex"))).toBe("Not allowed here");
    expect(verdictLabel({ verdict: "unknown", reviewKind: null })).toBe("Not checked yet");
    expect(verdictLabel({ verdict: "review", reviewKind: null })).toBe("Needs approval");
  });

  it("typologyPhrase goes through the same label", () => {
    const big = lot({ zone: "H", lotAreaSqFt: 43045, frontageFt: 198 });
    expect(typologyPhrase("single", findingOf(big, "single"))).toBe("House, staff approval (administrator exception)");
  });
});

describe("whatWouldChange", () => {
  it("re-evaluates: reaching the lot size on a Hillside lot still leaves the use approval", () => {
    const l = lot({ zone: "H", lotAreaSqFt: 2000 });
    const fs = evaluateLot(l, "current");
    const lines = whatWouldChange(l, fs, fs.find((f) => f.typology === "single")!, null);
    expect(lines[0]).toMatch(/^Combining with a neighbor to reach [\d,]+ sq ft → house would still need staff approval \(administrator exception\)$/);
  });

  it("reaching the lot size where the use is permitted makes the house allowed by use table", () => {
    const l = lot({ lotAreaSqFt: 1860 });
    const fs = evaluateLot(l, "current");
    expect(whatWouldChange(l, fs, fs.find((f) => f.typology === "single")!, null)[0]).toBe(
      "Combining with a neighbor to reach 2,400 sq ft → house allowed by use table",
    );
  });
});

describe("answerHeadline", () => {
  const green: TriageResult = { triage: "green", reasons: [], bestTypology: "single", pencils: true, gap: 0, margin: 1 };
  it("never says Ready or that a lot pays for itself", () => {
    const f = findingOf(lot(), "single");
    const h = answerHeadline(green, f, null);
    expect(h.text).not.toMatch(/ready|pays for itself/i);
    expect(h.text).toBe("Passes the screen: candidate for staff review");
  });

  it("uses the approval route for review findings", () => {
    const big = lot({ zone: "H", lotAreaSqFt: 43045, frontageFt: 198 });
    const yellow: TriageResult = { ...green, triage: "yellow", bestTypology: "townhome" };
    expect(answerHeadline(yellow, findingOf(big, "townhome"), null).text).toBe("Board approval (special exception)");
  });
});
