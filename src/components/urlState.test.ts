import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompsFile, Finding, LotsFile, RuleSet } from "@/lib/types";
import { evaluateLot, TODAY_PARAMS } from "@/lib/rules";
import { compsFor, DEFAULT_FINANCE } from "@/lib/finance";
import { buildSelectedCase } from "@/lib/selectedCase";
import { answerHeadline } from "./ui/answer";
import { DEFAULT_PROJECTS, parseUrlState, serializeUrlState, type UrlState } from "./urlState";

const base: UrlState = {
  lot: null,
  type: null,
  filterType: null,
  hoods: [],
  bill: false,
  tab: "lots",
  projects: DEFAULT_PROJECTS,
  finance: DEFAULT_FINANCE,
  land: {},
  status: "",
  triage: "",
  minArea: 0,
  onlyByRight: false,
  includeParks: false,
  reading: false,
  reformPreset: null,
  reformParams: null,
};

describe("shared link codec", () => {
  it("round-trips the Reform tab's preset and custom params", () => {
    const params = { ...TODAY_PARAMS, minLotArea: { ...TODAY_PARAMS.minLotArea, L: 1800 } };
    const custom: UrlState = { ...base, tab: "reform", reformPreset: "custom", reformParams: params };
    expect(parseUrlState(serializeUrlState(custom))).toEqual(custom);
    const bill: UrlState = { ...base, tab: "reform", reformPreset: "bill-2025-1545" };
    expect(serializeUrlState(bill)).toBe("tab=reform&preset=bill-2025-1545");
    expect(parseUrlState(serializeUrlState(bill))).toEqual(bill);
    expect(parseUrlState("tab=reform&preset=custom&rp=garbage").reformParams).toBeNull();
    // Lever ids carry the subdistrict letter in capitals.
    expect(parseUrlState("tab=reform&preset=min-lot-L-1800").reformPreset).toBe("min-lot-L-1800");
  });

  it("writes nothing at the defaults", () => {
    expect(serializeUrlState(base)).toBe("");
    expect(parseUrlState("")).toEqual(base);
  });

  it("round-trips land figures, filters, N and finance", () => {
    const s: UrlState = {
      ...base,
      lot: "0023F00165000000",
      type: "duplex",
      hoods: ["Central Northside", "Hazelwood"],
      bill: true,
      tab: "plan",
      projects: 12,
      finance: { ...DEFAULT_FINANCE, hardCostPerSf: 195, mode: "rent" },
      land: { "0023F00165000000": 100000, "0056N00203000000": 0 },
      status: "Available for Sale",
      triage: "yellow",
      minArea: 1000,
      onlyByRight: true,
      includeParks: true,
      reading: true,
    };
    const q = serializeUrlState(s);
    expect(q).toContain("land=0023F00165000000:100000,0056N00203000000:0");
    expect(q).toContain("parks=1");
    expect(q).toContain("n=12");
    expect(parseUrlState(`?${q}`)).toEqual(s);
  });

  it("drops malformed values instead of guessing", () => {
    const s = parseUrlState("?land=bad,0023F00165000000:-5,0023F00165000000x:abc,0023E00093000000:250000&status=Nope&triage=blue&minArea=-1&n=0");
    expect(s.land).toEqual({ "0023E00093000000": 250000 });
    expect(s.status).toBe("");
    expect(s.triage).toBe("");
    expect(s.minArea).toBe(0);
    expect(s.projects).toBe(DEFAULT_PROJECTS);
  });
});

const haveData = existsSync("public/data/lots.json") && existsSync("public/data/comps.json");

describe.skipIf(!haveData)("reopening a shared link", () => {
  const lots = haveData ? (JSON.parse(readFileSync("public/data/lots.json", "utf8")) as LotsFile).lots : [];
  const comps = haveData ? (JSON.parse(readFileSync("public/data/comps.json", "utf8")) as CompsFile) : null;

  /** What the answer card and Pays show for a URL state, built the way ByRightApp builds the selected case. */
  const shown = (u: UrlState) => {
    const lot = lots.find((l) => l.id === u.lot)!;
    const findings = { current: evaluateLot(lot, "current"), "bill-2025-1545": evaluateLot(lot, "bill-2025-1545") } as Record<RuleSet, Finding[]>;
    const c = buildSelectedCase({
      lot,
      ruleSet: u.bill ? "bill-2025-1545" : "current",
      findings,
      comps: compsFor(lot, comps),
      assumptions: u.finance,
      landOverride: u.land[lot.id] ?? null,
      filterTypology: u.filterType,
      pickedTypology: u.type,
    });
    return {
      headline: answerHeadline(c.triage, c.finding, c.proforma, lot).text,
      triage: c.triage.triage,
      gap: c.proforma?.gap ?? null,
      pencils: c.proforma?.pencils ?? null,
    };
  };

  it("126 Carrington at a $100,000 land figure reopens with the same shortfall, not assessed land", () => {
    // At the prior default ($185/sf, no site cost; hc=185&site=0 in the link) the lot is Green without the land figure.
    const prior = { ...DEFAULT_FINANCE, hardCostPerSf: 185, siteCostPerProject: 0 };
    const original: UrlState = { ...base, lot: "0023F00165000000", finance: prior, land: { "0023F00165000000": 100000 } };
    expect(serializeUrlState(original)).toMatch(/hc=185&site=0/);
    const reopened = parseUrlState(`?${serializeUrlState(original)}`);
    const before = shown(original);
    expect(shown(reopened)).toEqual(before);
    expect(before.pencils).toBe(false);
    expect(before.triage).not.toBe("green");
    // Without the land figure the lot reads differently: the link must carry it.
    expect(shown({ ...original, land: {} }).triage).toBe("green");
  });
});
