import { describe, expect, it } from "vitest";
import type { Lot } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { buildApplicationPlan, formatBlockLot, NEVER_SUBMITS, renderApplicationMarkdown } from "./application";

function lot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: "0043R00172000000",
    address: "3336 Oregon St",
    neighborhood: "Esplen",
    councilDistrict: "2",
    ward: "20",
    lat: 40.46,
    lon: -80.05,
    zone: "R1D-H",
    lotAreaSqFt: 5775,
    frontageFt: 33.4,
    landValue: 30100,
    status: "Available for Sale",
    inventoryType: "Public Sale",
    hazards: { steepSlope: false, undermined: false, floodZone: false },
    ...overrides,
  };
}

function plan(l: Lot, typology: Parameters<typeof buildApplicationPlan>[6]) {
  const findings = evaluateLot(l, "current");
  return buildApplicationPlan(l, findings, "current", triageLot(l, findings, null), null, null, typology);
}

const field = (p: ReturnType<typeof plan>, label: string) => p.purchaseForm.find((f) => f.label.startsWith(label));

describe("buildApplicationPlan", () => {
  it("by-right lot: no ZBA draft, 'No' on the variance field", () => {
    const p = plan(lot(), "single");
    expect(p.verdict).toBe("by-right");
    expect(p.zba).toBeNull();
    expect(field(p, "Will you need to seek a variance")?.value).toBe("No");
    expect(field(p, "When will you apply")?.value).toContain("6 months");
    expect(p.steps.find((s) => s.id === "zoning")?.body[0]).toContain("no hearing expected");
    expect(p.steps[0].callout?.text).toBe("Listed as available for sale.");
  });

  it("R2-L lot of 2,400 sf: dimensional variance citing § 903.03, required 3,000, measured 2,400", () => {
    const p = plan(lot({ zone: "R2-L", lotAreaSqFt: 2400, frontageFt: 30 }), "single");
    expect(p.verdict).toBe("variance");
    expect(p.zba).not.toBeNull();
    expect(p.zba!.requestTypes).toContain("Dimensional variance");
    const line = p.zba!.sections.find((s) => s.text.includes("§ 903.03"));
    expect(line?.text).toMatch(/required 3,000 sq ft, lot has 2,400 sq ft/);
    expect(p.zba!.findings).toHaveLength(5);
    expect(p.zba!.criteria.section).toBe("§ 922.09.E");
    expect(field(p, "Will you need to seek a variance")?.value).toMatch(/^Yes: .*§ 903\.03/);
    expect(p.steps.find((s) => s.id === "zoning")?.chips.map((c) => c.label).join(" ")).toContain("$400");
  });

  it("R1D duplex: use variance with the by-right alternatives line", () => {
    const p = plan(lot(), "duplex");
    expect(p.verdict).toBe("prohibited");
    expect(p.zba?.requestTypes).toContain("Use variance");
    const zoning = p.steps.find((s) => s.id === "zoning")!;
    expect(zoning.body.join(" ")).toMatch(/Consider a typology that is by right here instead: .*Single-unit detached/);
  });

  it("cautions on lots not listed for sale", () => {
    const p = plan(lot({ status: "Hold for Study", inventoryType: "Hold For Study" }), "single");
    expect(p.steps[0].callout).toEqual({
      tone: "warn",
      text: "This lot's inventory status is Hold for Study; confirm availability with the Real Estate Division before applying.",
    });
  });

  it("never fabricates applicant fields", () => {
    const p = plan(lot(), "single");
    for (const f of p.purchaseForm.filter((f) => f.who === "you")) expect(f.value).toBeNull();
    expect(field(p, "Have you verified")?.note).toBe("You must visit the site.");
  });
});

describe("formatBlockLot", () => {
  it("formats a PARID as block-map-lot", () => {
    expect(formatBlockLot("0043R00172000000").text).toBe("43-R-172");
  });
  it("appends a non-zero suffix and says so", () => {
    const r = formatBlockLot("0043R00172000100");
    expect(r.text).toBe("43-R-172-0001-00");
    expect(r.note).toBeTruthy();
  });
});

describe("renderApplicationMarkdown", () => {
  it("contains the never-submits banner", () => {
    const md = renderApplicationMarkdown(plan(lot({ zone: "R2-L", lotAreaSqFt: 2400 }), "single"));
    expect(md).toContain(NEVER_SUBMITS);
    expect(md).toContain("DRAFT: edit before filing");
    expect(md).not.toMatch(/\bsubmit(ted|ting)? (your|the) application\b/i);
  });
});
