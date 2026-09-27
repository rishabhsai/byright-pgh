"""Write docs/validation-set.md: 20 named lots, the zoning-map cross-check, and the engine's screen.

Run from the repo root after build.py:
    pipeline/.venv/bin/python pipeline/validate.py

The zone comparison is automated: `zone` (the City inventory's zoned_as) against `zoneMap` (the City
zoning map polygon under the inventory point), both from public/data/lots.json. The engine columns come
from the TypeScript rules engine itself (src/lib/validationSet.test.ts, run through vitest), so the table
shows exactly what the app shows. The "Hand check" column is left empty for a person to fill in against
ecode360 and the City zoning map; this script never fills it.
"""

import json
import re
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOTS = ROOT / "public" / "data" / "lots.json"
OUT = ROOT / "docs" / "validation-set.md"

# (parcel id, why it is in the set). Never state a triage result here: the Triage column comes from the engine,
# and main() refuses a reason that claims Green or a cleared cost-and-return screen the engine does not show.
SET = [
    ("0023F00165000000", "Allowed townhouse, recorded for sale; short of the target return at default assumptions, clears it only at the 1.3× premium"),
    ("0086L00500000000", "Sliver: 259 sf LNC lot, FAR 2:1"),
    ("0055R00106000000", "Hillside: administrator exception, slope flag"),
    ("0085K00296000000", "Missing frontage; inventory and map disagree"),
    ("0086L00060000000", "Allowed, but Hold for Study (not recorded for sale), so finance is not screened"),
    ("0082B00053000000", "Park record in the P district"),
    ("0056N00203000000", "Hazelwood, 19.5 ft lot: attached prototype"),
    ("0056N00206000000", "Hazelwood, 19.5 ft lot"),
    ("0056N00211000000", "Hazelwood, 19 ft lot"),
    ("0021N00315000000", "Hillside, 2,000 sf under the 3,200 sf minimum; Sale Pending"),
    ("0023E00093000000", "URA Transfer channel; short of the target return at default assumptions"),
    ("0020G00055000000", "R1D-L, 50 ft lot: detached house"),
    ("0024B00153000A00", "R1D-M, 1,274 sf under the 2,400 sf minimum"),
    ("0013P00172000000", "R2-L, two-unit permitted"),
    ("0007B00223000000", "R2-H, 20 ft lot"),
    ("0009M00130000000", "RM-M, map agrees"),
    ("0006A00018000000", "LNC, 2,450 sf"),
    ("0003K00037000000", "H, 1,519 sf under the 3,200 sf minimum"),
    ("0011F00168000000", "R2-VH in the inventory, UPR-B on the map"),
    ("0126L00091000000", "Park inventory type in R1D, passes the other screens"),
]

TYPE_NAME = {
    "single": "House",
    "single_adu": "House + ADU",
    "duplex": "Duplex",
    "triplex": "Triplex",
    "townhome": "Townhouse",
}


def engine_results(ids):
    env = {**os.environ, "VALIDATE_IDS": ",".join(ids)}
    proc = subprocess.run(
        ["pnpm", "vitest", "run", "src/lib/validationSet.test.ts"],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=300,
    )
    for line in proc.stdout.splitlines():
        if line.startswith("VALIDATE "):
            return {r["id"]: r for r in json.loads(line[len("VALIDATE "):])}
    sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
    raise SystemExit("engine run printed no VALIDATE line")


def cell(s):
    return str(s).replace("|", "\\|")


def main():
    doc = json.loads(LOTS.read_text())
    lots = {l["id"]: l for l in doc["lots"]}
    ids = [i for i, _ in SET]
    missing = [i for i in ids if i not in lots]
    if missing:
        raise SystemExit(f"not in lots.json: {missing}")
    eng = engine_results(ids)
    # Determinism: a second, independent engine run must print the same results for every parcel.
    deterministic = engine_results(ids) == eng
    if not deterministic:
        raise SystemExit("engine results differ between two runs")

    zoning_src = next((s for s in doc["sources"] if s["name"].startswith("City of Pittsburgh Zoning Districts")), None)
    compared = [l for l in doc["lots"] if l.get("zoneAgrees") is not None]
    agree_all = sum(1 for l in compared if l["zoneAgrees"])

    claims = re.compile(r"\bgreen\b|clears the cost-and-return screen", re.I)
    stale = [pid for pid, why in SET if claims.search(why) and eng[pid]["triage"] != "green"]
    if stale:
        raise SystemExit(f"'Why in the set' claims a result the engine does not show at default assumptions: {stale}")

    rows = []
    for pid, why in SET:
        l, e = lots[pid], eng[pid]
        agrees = {True: "yes", False: "**no**", None: "not compared"}[l.get("zoneAgrees")]
        if e["verdict"] == "unknown":
            screen = e["label"]
        else:
            screen = f"{TYPE_NAME[e['typology']]}: {e['label']} ({', '.join(e['sections'])})"
        rows.append([
            pid, l["address"] or "(no address)", why, l["zone"], l.get("zoneMap") or "none", agrees,
            screen, e["triage"].capitalize(), e["evidence"], "☐",
        ])
    set_agree = sum(1 for pid, _ in SET if lots[pid].get("zoneAgrees") is True)
    set_compared = sum(1 for pid, _ in SET if lots[pid].get("zoneAgrees") is not None)

    L = []
    L.append("# Validation set: 20 lots")
    L.append("")
    L.append("Generated by `pipeline/validate.py` from `public/data/lots.json` "
             f"(built {doc['generatedAt']}) and the rules engine in `src/lib/`. Current code, default assumptions.")
    L.append("")
    L.append("**What is automated.** The zone columns compare two City sources at the lot's inventory point: "
             "*Inventory zone* is the City property inventory's `zoned_as` (the only zoning input the engine uses) and "
             "*Map zone* is `zon_new` of the City zoning-map polygon that contains the point"
             + (f" ({zoning_src['url']}, {zoning_src['vintage']})" if zoning_src else "")
             + ". Where they disagree, the app marks Use as Unknown and the lot cannot be Green. "
             f"Citywide, {agree_all:,} of {len(compared):,} compared lots agree ({100 * agree_all / len(compared):.1f}% agreement "
             "between the two sources, not a measure of verdict accuracy); "
             f"in this set, {set_agree} of {set_compared}.")
    L.append("")
    L.append("**Automated checks performed** (machine-verified; no person was involved):")
    L.append("")
    L.append(f"- Inventory district vs. City zoning map at each lot's inventory point: {agree_all:,} of {len(compared):,} "
             f"compared lots agree citywide; {set_agree} of {set_compared} in this set (columns *Map zone* and *Agree?*).")
    L.append("- Engine determinism: the engine was run twice for these 20 parcels and printed identical results; "
             "`src/lib/evalCompute.test.ts` checks that the Web Worker and main-thread paths build the same plan, "
             "brief and CSV on Hazelwood and a 500-lot citywide sample.")
    L.append("- District tables: two AI-agent audits (not practitioner or City review) checked the encoded "
             "district tables in `src/lib/rules/districts.ts` against the ecode360 captures in `docs/sources/`.")
    L.append("")
    L.append("None of these is a human check of a verdict. The *Hand check* column below is the human check.")
    L.append("")
    L.append("**Checked by** (the team fills this in; while blank, no person has checked any row):")
    L.append("")
    L.append("- Name: ________")
    L.append("- Date: ________")
    L.append("- Rows checked: __ of 20 · agree: __ · disagree: __ (reasons in the *Hand check* column)")
    L.append("")
    L.append("**What is manual, and not done yet.** *Our screen* is the engine's result for the lot's best home type "
             "(the proposal the app shows by default) with the Zoning Code sections it cites. The *Hand check* column is "
             "for a person to confirm that result against the ecode360 text (`docs/sources/`) and the City's zoning map "
             "viewer, then replace ☐ with ☑ (agree) or ☒ (disagree, with a reason). No row has been hand-checked yet; "
             "we will publish the agreement count and every disagreement once they are.")
    L.append("")
    L.append("Reproduce: `pipeline/.venv/bin/python pipeline/build.py && pipeline/.venv/bin/python pipeline/validate.py`.")
    L.append("")
    head = ["Parcel", "Address", "Why in the set", "Inventory zone", "Map zone", "Agree?", "Our screen (best type)",
            "Triage", "Evidence", "Hand check"]
    L.append("| " + " | ".join(head) + " |")
    L.append("|" + "|".join("---" for _ in head) + "|")
    for r in rows:
        L.append("| " + " | ".join(cell(x) for x in r) + " |")
    L.append("")
    L.append("Evidence counts are the six screening checks (Use, Lot size, Width, Fit, Site, Finance), counted literally; "
             "*not checked* is never a pass. A screen, not a zoning determination: the Zoning Administrator decides.")
    L.append("")
    text = "\n".join(L)
    OUT.write_text(text)
    print(text)


if __name__ == "__main__":
    main()
