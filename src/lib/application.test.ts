import { describe, expect, it } from "vitest";
import type { Comps, Finding, Lot } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { DEFAULT_FINANCE, proformaWithFallback } from "./finance";
import {
  buildApplicationPlan,
  formatBlockLot,
  hasStreetSuffix,
  NEVER_SUBMITS,
  renderApplicationMarkdown,
  WORKSHEET_LABEL,
  type ApplicationPlan,
} from "./application";

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

function plan(l: Lot, typology: Parameters<typeof buildApplicationPlan>[6], findings: Finding[] = evaluateLot(l, "current")) {
  return buildApplicationPlan(l, findings, "current", triageLot(l, findings, null), null, null, typology);
}

const field = (p: ApplicationPlan, label: string) => p.purchaseForm.find((f) => f.label.startsWith(label));

/** Every string the plan can show or export, split into sentences. */
function sentences(p: ApplicationPlan): string[] {
  const all: string[] = [renderApplicationMarkdown(p)];
  const walk = (v: unknown) => {
    if (typeof v === "string") all.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(p);
  return all.flatMap((s) => s.split(/(?<=[.?!])\s+|\n+/)).map((s) => s.trim()).filter(Boolean);
}

const SMALL_R2 = lot({ zone: "R2-L", lotAreaSqFt: 2400, frontageFt: 30, hazards: { steepSlope: true, undermined: false, floodZone: false } });

describe("buildApplicationPlan: worksheet states only what the record shows", () => {
  const cases: [string, ApplicationPlan][] = [
    ["by-right single", plan(lot(), "single")],
    ["dimensional failure", plan(SMALL_R2, "single")],
    ["use variance", plan(lot(), "duplex")],
    ["hillside", plan(lot({ zone: "H", lotAreaSqFt: 20000, frontageFt: 80 }), "single")],
  ];

  it.each(cases)("%s: no no-hearing, readiness, subsidy-need or pays-for-itself wording", (_, p) => {
    for (const s of sentences(p)) expect(s).not.toMatch(/no hearing expected|\bready\b|releas|needs subsidy|pays? for (it|them)sel|Allowed, no hearing/i);
  });

  it.each(cases)("%s: no invented hardship, vacancy, or lot-of-record claims", (_, p) => {
    for (const s of sentences(p)) {
      expect(s).not.toMatch(/not (been )?created by the (applicant|appellant)/i);
      expect(s).not.toMatch(/would (otherwise )?remain vacant/i);
      if (/lot of record/i.test(s)) expect(s).toMatch(/\?$/);
    }
  });

  it("R2-L lot of 2,400 sf: record cites § 903.03 with required and measured values", () => {
    const p = plan(SMALL_R2, "single");
    expect(p.verdict).toBe("variance");
    const z = p.zba!;
    expect(z.label).toBe(WORKSHEET_LABEL);
    expect(WORKSHEET_LABEL).toBe("ZBA review worksheet (DRAFT)");
    expect(z.criteria.section).toBe("§ 922.09.E");
    expect(z.findings).toHaveLength(5);
    const record = z.findings.flatMap((f) => f.record).join("\n");
    expect(record).toMatch(/§ 903\.03.*required 3,000 sq ft, lot has 2,400 sq ft/);
    expect(record).toMatch(/steep slope.*inventory point/i);
    expect(record).toContain("R2-L");
  });

  it("asks the applicant for the evidence the Board needs, as questions with attachments", () => {
    const z = plan(SMALL_R2, "single").zba!;
    const ask = z.findings.flatMap((f) => f.establish).join("\n");
    expect(ask).toContain("Is this a lot of record? Attach the deed and recorded plat.");
    expect(ask).toMatch(/Has the lot been subdivided or consolidated since the standard was adopted\?/);
    expect(ask).toMatch(/What conforming development did you consider, and why is none feasible\? Attach a site sketch\./);
    expect(ask).toMatch(/How does the proposal fit adjacent lot sizes and heights\? Attach photos and a block survey\./);
  });

  it("lot-size failure: asks the § 921.04 eligibility questions (separate ownership from abutting land, vacancy history), never assures eligibility", () => {
    const z = plan(SMALL_R2, "single").zba!;
    const ask = z.findings[0].establish.join("\n");
    expect(ask).toMatch(/separate ownership from all abutting land on the date/);
    expect(ask).toMatch(/how long has it been vacant\?/);
    expect(ask).toMatch(/chain of title for this lot and each abutting parcel, including any publicly held neighbor/);
    expect(z.note).toMatch(/eligibility investigation, not an assurance/);
    expect(z.note).not.toMatch(/bring the same deed and plat evidence/);
  });

  it("never assumes who buys: a sale-mode description does not promise owner-occupants", () => {
    const comps = { neighborhood: "Esplen", zip: "15204", zhvi: 90_000, zhviDate: "2026-08-31", zori: 1200, zoriDate: "2026-08-31" };
    const l = lot();
    const findings = evaluateLot(l, "current");
    const pf = proformaWithFallback(l, "single", comps, DEFAULT_FINANCE);
    expect(pf?.mode).toBe("sale");
    const p = buildApplicationPlan(l, findings, "current", null, pf, comps, "single");
    expect(p.description).not.toMatch(/owner-occupant/i);
    expect(p.description).toMatch(/buyer terms/i);
  });

  it("dimensional failure: staff decide between a § 922.09 variance and a § 921.04 nonconforming-lot exception", () => {
    const p = plan(SMALL_R2, "single");
    const zoning = p.steps.find((s) => s.id === "zoning")!.body.join(" ");
    expect(zoning).toContain(
      "Relief path determined by zoning staff: dimensional variance under § 922.09 or nonconforming-lot exception under § 921.04 (https://ecode360.com/45478977).",
    );
    expect(field(p, "Will you need to seek a variance")?.value).toMatch(/^Yes: .*§ 903\.03/);
  });

  it("administrator review kind: staff review under § 922.08, no ZBA hearing or fee, no worksheet", () => {
    const l = lot();
    const base = evaluateLot(l, "current");
    const findings = base.map((f) =>
      f.typology === "single" ? { ...f, verdict: "review" as const, reviewKind: "administrator" as const } : f,
    );
    const p = plan(l, "single", findings);
    const zoning = p.steps.find((s) => s.id === "zoning")!;
    expect(zoning.body.join(" ")).toContain("Administrator Exception, staff review under § 922.08, no ZBA hearing or $400 ZBA fee");
    expect(zoning.chips.map((c) => c.label).join(" ")).not.toContain("$400");
    expect(p.zba).toBeNull();
  });

  it("special review kind: Special Exception hearing under § 922.07", () => {
    const l = lot();
    const findings = evaluateLot(l, "current").map((f) =>
      f.typology === "single" ? { ...f, verdict: "review" as const, reviewKind: "special" as const } : f,
    );
    const zoning = plan(l, "single", findings).steps.find((s) => s.id === "zoning")!;
    expect(zoning.body.join(" ")).toContain("Special Exception hearing under § 922.07");
  });

  it("R1D duplex: use variance with the by-right alternatives line", () => {
    const p = plan(lot(), "duplex");
    expect(p.verdict).toBe("prohibited");
    expect(p.zba?.requestTypes).toContain("Use variance");
    const zoning = p.steps.find((s) => s.id === "zoning")!;
    expect(zoning.body.join(" ")).toMatch(/Consider a typology that is by right here instead: .*House/);
  });
});

describe("buildApplicationPlan: purchase form", () => {
  it("by-right lot: never a bare 'No' on the variance field, no invented timeline", () => {
    const p = plan(lot(), "single");
    expect(p.verdict).toBe("by-right");
    expect(p.zba).toBeNull();
    expect(field(p, "Will you need to seek a variance")?.value).toBe("Not under the checks we ran; zoning staff confirm");
    const when = field(p, "When will you apply")?.value ?? "";
    expect(when).toBe("You estimate; typically after closing");
    expect(when).not.toMatch(/month/);
    const zoning = p.steps.find((s) => s.id === "zoning")?.body[0] ?? "";
    expect(zoning).toContain("allowed by the use table and lot-size standards; other standards not checked");
    expect(zoning).not.toMatch(/no hearing/);
  });

  it("never fabricates applicant fields", () => {
    const p = plan(lot(), "single");
    for (const f of p.purchaseForm.filter((f) => f.who === "you")) expect(f.value).toBeNull();
    expect(field(p, "Have you verified")?.note).toBe("You must visit the site.");
  });
});

describe("buildApplicationPlan: acquisition channel", () => {
  const acquire = (l: Lot) => plan(l, "single").steps.find((s) => s.id === "acquire")!;

  it("Public Sale, available: the City Request to Purchase form", () => {
    const s = acquire(lot());
    expect(s.callout?.tone).toBe("ok");
    expect(s.body.join(" ")).toContain("Request to Purchase Application – Individuals");
    expect(s.body.join(" ")).toMatch(/businesses and nonprofits use the City's Request to Purchase Application – Businesses/i);
    expect(s.body.join(" ")).toContain("https://pghlandbank.org/how-to-buy-vacant-blighted-or-tax-delinquent-property-in-pittsburgh/");
  });

  it("URA Transfer, available: route to the URA, not the City Finance form", () => {
    const p = plan(lot({ inventoryType: "URA Transfer" }), "single");
    const s = p.steps.find((x) => x.id === "acquire")!;
    expect(s.callout?.text).toBe(
      "Listed for transfer to the URA; contact propertyquestions@ura.org, purchases are subject to URA Board approval",
    );
    expect(s.body.join(" ")).not.toContain("property.sales.3tb@pittsburghpa.gov");
    expect(p.acquisition).toBe("ura");
  });

  it("any other status: caution to confirm availability", () => {
    const s = acquire(lot({ status: "Hold for Study", inventoryType: "Hold For Study" }));
    expect(s.callout).toEqual({
      tone: "warn",
      text: "This lot's inventory status is Hold for Study. Confirm availability with the Real Estate Division before applying.",
    });
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
  it("contains the never-submits banner and the worksheet label", () => {
    const md = renderApplicationMarkdown(plan(SMALL_R2, "single"));
    expect(md).toContain(NEVER_SUBMITS);
    expect(md).toContain("ZBA review worksheet (DRAFT)");
    expect(md).toContain("What the record shows");
    expect(md).toContain("What you must establish");
    expect(md).not.toMatch(/\bsubmit(ted|ting)? (your|the) application\b/i);
  });
});

describe("buildApplicationPlan: relief comes from every failed check and the review route", () => {
  // Real inventory records (public/data/lots.json), inlined so the test does not depend on the data build.
  const FORBES = lot({ id: "0086L00500000000", address: "0 Forbes Av", zone: "LNC", lotAreaSqFt: 259, frontageFt: 14.4, status: "Hold for Study", inventoryType: "Hold For Study" });
  const HAZELWOOD_AVE = lot({
    id: "0055R00106000000",
    address: "4613 Hazelwood Ave",
    zone: "H",
    lotAreaSqFt: 43045,
    frontageFt: 198,
    status: "Permanent City Ownership",
    hazards: { steepSlope: true, undermined: false, floodZone: false },
  });
  const SACRAMENTO = lot({ id: "0021N00315000000", address: "2680 Sacramento Ave", zone: "H", lotAreaSqFt: 2000, frontageFt: 25, status: "Sale Pending" });
  const zoningText = (p: ApplicationPlan) => p.steps.find((s) => s.id === "zoning")!.body.join(" ");

  it("0 Forbes Av (259 sf LNC): FAR relief with § 904.02.C, a smaller building or a variance, and a worksheet", () => {
    for (const t of ["single", "triplex"] as const) {
      const p = plan(FORBES, t);
      expect(p.verdict).toBe("variance");
      const z = zoningText(p);
      expect(z).toContain("Relief needed: FAR (§ 904.02.C");
      expect(z).toContain("a smaller building (≤ 518 sq ft) or a dimensional variance");
      const v = field(p, "Will you need to seek a variance")?.value ?? "";
      expect(v).toMatch(/^Yes: FAR \(§ 904\.02\.C\)/);
      expect(v).not.toBe("Not under the checks we ran; zoning staff confirm");
      expect(p.zba?.requestTypes.join(" ")).toMatch(/smaller building \(≤ 518 sq ft\) or dimensional variance/i);
      expect(p.zba?.sections.map((s) => s.text).join(" ")).toContain("§ 904.02.C");
      expect(p.zba?.findings).toHaveLength(5);
      expect(p.zba?.note ?? "").not.toMatch(/Special exceptions are decided/);
      expect(p.verdictLabel).toBe("Relief needed (smaller building or variance)");
    }
  });

  it("4613 Hazelwood Ave (H, 43,045 sf): a house routes to an administrator exception, a townhouse to a special exception", () => {
    const single = plan(HAZELWOOD_AVE, "single");
    expect(single.verdict).toBe("review");
    expect(single.steps.find((s) => s.id === "zoning")!.title).toBe("Zoning review: Administrator Exception");
    expect(single.zba).toBeNull();
    expect(field(single, "Will you need to seek a variance")?.value).toBe("Yes: administrator exception (§ 922.08), decided by zoning staff");
    expect(single.verdictLabel).toBe("Staff approval (administrator exception)");

    const town = plan(HAZELWOOD_AVE, "townhome");
    expect(town.verdict).toBe("review");
    expect(zoningText(town)).toContain("Special Exception hearing under § 922.07.");
    expect(town.zba?.requestTypes).toEqual(["Special exception (§ 922.07)"]);
    expect(field(town, "Will you need to seek a variance")?.value).toBe("Yes: special exception (§ 922.07), Zoning Board hearing");
    expect(town.verdictLabel).toBe("Board approval (special exception)");
  });

  it("2680 Sacramento Ave (H, 2,000 sf): lot-size relief and the administrator exception both stay on the filing", () => {
    const p = plan(SACRAMENTO, "single");
    expect(p.verdict).toBe("variance");
    const z = zoningText(p);
    expect(z).toContain("Relief needed: minimum lot size (§ 905.02.C");
    expect(z).toContain("The use also needs an Administrator Exception under § 922.08");
    const v = field(p, "Will you need to seek a variance")?.value ?? "";
    expect(v).toMatch(/^Yes: minimum lot size \(§ 905\.02\.C\)/);
    expect(v).toContain("administrator exception (§ 922.08)");
    expect(p.zba?.requestTypes).toEqual([
      "Dimensional variance (§ 922.09) or nonconforming-lot exception (§ 921.04); zoning staff determine which",
      "Administrator exception (§ 922.08)",
    ]);
  });

  it("never says parking passed: parking is unverified on a vacant lot", () => {
    for (const s of sentences(plan(SMALL_R2, "single"))) expect(s).not.toMatch(/checks we ran \(use, lot area, lot width, parking/);
  });
});

describe("purchase-form address", () => {
  const ADDR = "Property to be Purchased Address";
  const comps: Comps = { neighborhood: "Test", zip: "15212", zhvi: null, zhviDate: null, zori: null, zoriDate: null };
  const build = (l: Lot, c: Comps | null) => {
    const f = evaluateLot(l, "current");
    return buildApplicationPlan(l, f, "current", triageLot(l, f, null), null, c, "single");
  };

  it("adds the ZIP when known, in the plan and the markdown export", () => {
    const p = build(SMALL_R2, comps);
    expect(field(p, ADDR)?.value).toBe(`${SMALL_R2.address}, Pittsburgh, PA 15212`);
    expect(field(p, ADDR)?.note ?? "").not.toContain("ZIP");
    expect(renderApplicationMarkdown(p)).toContain(`${SMALL_R2.address}, Pittsburgh, PA 15212`);
  });

  it("asks for the ZIP when it is not known", () => {
    const p = build(SMALL_R2, null);
    expect(field(p, ADDR)?.value).toBe(`${SMALL_R2.address}, Pittsburgh, PA`);
    expect(field(p, ADDR)?.note).toContain("Add the ZIP code from the County record.");
  });

  it("keeps an address without a street suffix as-is and says it is as recorded in the City inventory", () => {
    const l = lot({ address: "1200 Voskamp" });
    const p = build(l, comps);
    expect(field(p, ADDR)?.value).toBe("1200 Voskamp, Pittsburgh, PA 15212");
    expect(field(p, ADDR)?.note).toContain("as recorded in the City inventory");
    expect(renderApplicationMarkdown(p)).toContain("as recorded in the City inventory");
    expect(field(build(SMALL_R2, comps), ADDR)?.note ?? "").not.toContain("as recorded");
  });

  it("recognizes inventory suffix abbreviations and trailing qualifiers", () => {
    for (const a of ["3336 Oregon St", "0 Forbes Av", "12 Mission Wy", "5 Grandview Bo", "7 Brownsville Rd Ext", "9 Ohio St W"]) expect(hasStreetSuffix(a)).toBe(true);
    for (const a of ["1200 Voskamp", "44 Perrysville", "0 Rule"]) expect(hasStreetSuffix(a)).toBe(false);
  });
});

describe("unresolved permission in the application packet", () => {
  it("R1D townhouse with no width (like 1978 Montier St): resolve the width first; no definite special-exception route", () => {
    const l = lot({ zone: "R1D-L", frontageFt: null, lotAreaSqFt: 31806 });
    const p = plan(l, "townhome");
    const zoning = p.steps.find((s) => s.id === "zoning")!;
    expect(zoning.title).toBe("Zoning review: resolve permission first");
    expect(zoning.body[0]).toBe(
      "Resolve permission: confirm lot width (§ 911.04.A.69A). P if lot width ≤ 35 ft, else S; width not in the record.",
    );
    expect(zoning.body.join(" ")).toMatch(/35 ft or narrower.*by right.*wider.*Special Exception \(§ 922\.07\)/);
    expect(field(p, "Will you need to seek a variance")?.value).toBe(
      "Not yet known: P if lot width ≤ 35 ft, else S; width not in the record. Zoning staff confirm.",
    );
    expect(p.zba).toBeNull();
    expect(p.verdictLabel).toBe("Permission unresolved (lot width not in the record)");
  });

  it("House + ADU under today's code: the overlay question, never 'a use variance is required'", () => {
    const p = plan(lot(), "single_adu");
    const text = sentences(p).join(" ");
    expect(text).not.toMatch(/use variance is required/);
    expect(p.steps.find((s) => s.id === "zoning")!.body[0]).toMatch(/^Resolve permission: confirm ADU overlay \(§ 912\.08\)\. ADU overlay applicability unknown/);
    expect(field(p, "Will you need to seek a variance")?.value).toMatch(/^Not yet known: ADU overlay applicability unknown/);
  });

  it("when a lot standard also fails, the permission question goes first in What you must establish", () => {
    const l = lot({ zone: "R1D-M", frontageFt: null, lotAreaSqFt: 1500 });
    const p = plan(l, "townhome");
    expect(p.verdict).toBe("variance");
    expect(p.zba!.findings[0].establish[0]).toBe(
      "Which use route applies? P if lot width ≤ 35 ft, else S; width not in the record. Attach a survey showing the lot width.",
    );
  });
});
