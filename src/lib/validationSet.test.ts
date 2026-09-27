import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompsFile, LotsFile } from "./types";
import { verdictLabel } from "./types";
import { evaluateLot } from "./rules";
import { triageLot } from "./triage";
import { compsFor, DEFAULT_FINANCE } from "./finance";
import { evidenceForLot, pickFinding, summary } from "./evidence";

/*
 * Engine side of pipeline/validate.py: for the parcel IDs in VALIDATE_IDS (comma-separated), print one
 * VALIDATE line of JSON with the screened proposal, its verdict, the sections it cites, and the triage color.
 * The Python script adds the zoning-map comparison and writes docs/validation-set.md.
 */
const LOTS = "public/data/lots.json";
const COMPS = "public/data/comps.json";
const ids = (process.env.VALIDATE_IDS ?? "").split(",").filter(Boolean);

describe.runIf(ids.length > 0 && existsSync(LOTS) && existsSync(COMPS))("validation set (engine side)", () => {
  it("prints the engine result for each requested parcel", () => {
    const lots = (JSON.parse(readFileSync(LOTS, "utf8")) as LotsFile).lots;
    const file = JSON.parse(readFileSync(COMPS, "utf8")) as CompsFile;
    const out = ids.map((id) => {
      const lot = lots.find((l) => l.id === id);
      if (!lot) return { id, missing: true };
      const findings = evaluateLot(lot, "current");
      const comps = compsFor(lot, file);
      const triage = triageLot(lot, findings, comps, DEFAULT_FINANCE);
      const f = pickFinding(findings, triage, null);
      const ev = evidenceForLot(lot, findings, triage, comps, DEFAULT_FINANCE, null);
      const sections = [...new Set(f.checks.filter((c) => c.id === "use" || c.id === "lot-area" || c.id === "far" || c.passed === false).map((c) => c.citation.section))];
      return {
        id,
        typology: f.verdict === "unknown" ? null : f.typology,
        verdict: f.verdict,
        label: verdictLabel(f),
        sections,
        triage: triage.triage,
        evidence: summary(ev),
        reasons: triage.reasons,
      };
    });
    expect(out).toHaveLength(ids.length);
    process.stdout.write(`\nVALIDATE ${JSON.stringify(out)}\n`);
  }, 60_000);
});
