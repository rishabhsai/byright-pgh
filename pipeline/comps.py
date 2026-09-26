"""Build public/data/comps.json (the CompsFile type in src/lib/types.ts).

Run from the repo root after pipeline/build.py:
    pipeline/.venv/bin/python pipeline/comps.py

Inputs (downloaded to pipeline/raw/ when missing; /tmp copies are used if present):
  - Zillow ZHVI by neighborhood (all homes, mid tier, smoothed, seasonally adjusted)
  - Zillow ZORI by ZIP (all homes plus multifamily, smoothed)
  - Allegheny County assessments PROPERTYZIP per lot (WPRDC datastore), cached in
    pipeline/raw/assessment_zips.json. build.py's pipeline/raw/assessments.json is
    used first when its records carry PROPERTYZIP.
"""

import csv
import json
import shutil
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
ROOT = HERE.parent
LOTS = ROOT / "public" / "data" / "lots.json"
OUT = ROOT / "public" / "data" / "comps.json"
UA = {"User-Agent": "ByRightPGH-hackathon-pipeline/1.0"}

ZILLOW_PAGE = "https://www.zillow.com/research/data/"
ZHVI_NAME = "Neighborhood_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
ZORI_NAME = "Zip_zori_uc_sfrcondomfr_sm_month.csv"
ZHVI_URL = f"https://files.zillowstatic.com/research/public_csvs/zhvi/{ZHVI_NAME}"
ZORI_URL = f"https://files.zillowstatic.com/research/public_csvs/zori/{ZORI_NAME}"
ZHVI_FILE = RAW / ZHVI_NAME
ZORI_FILE = RAW / ZORI_NAME
TMP_COPIES = {ZHVI_FILE: Path("/tmp/zhvi_nbhd.csv"), ZORI_FILE: Path("/tmp/zori_ok.csv")}

WPRDC = "https://data.wprdc.org"
ASSESS_RESOURCE = "65855e14-549e-4992-b5be-d629afc676fa"
ZIP_CACHE = RAW / "assessment_zips.json"

# Zillow neighborhood name -> City of Pittsburgh neighborhood name (lots.json)
ZILLOW_TO_CITY = {
    "Crawford Roberts": "Crawford-Roberts",
    "Fine View": "Fineview",
    "Marshall - Shadeland": "Marshall-Shadeland",
    "Mt Oliver": "Mt. Oliver",
    "Southside Flats": "South Side Flats",
    "Southside Slopes": "South Side Slopes",
    "Spring Hill - City View": "Spring Hill-City View",
    "Wind Gap": "Windgap",
}
# Zillow's single "Oakland" fills the City's four Oakland neighborhoods when they are absent.
OAKLAND_CHILDREN = ["Central Oakland", "South Oakland", "West Oakland", "North Oakland"]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def ensure(dest, url):
    if dest.exists() and dest.stat().st_size > 0:
        return
    tmp = TMP_COPIES.get(dest)
    if tmp and tmp.exists() and tmp.stat().st_size > 0:
        shutil.copyfile(tmp, dest)
        return
    log(f"downloading {url}")
    with requests.get(url, headers=UA, timeout=600, stream=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)


def latest(row, months):
    """(value, month) for the latest non-empty month in a Zillow wide row."""
    for m in reversed(months):
        v = (row.get(m) or "").strip()
        if v:
            return round(float(v)), m
    return None, None


def read_zillow(path, keep):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        months = [c for c in reader.fieldnames if c[:2] in ("19", "20") and len(c) == 10]
        for row in reader:
            if keep(row):
                yield row, months


def load_zhvi():
    raw = {}
    for row, months in read_zillow(ZHVI_FILE, lambda r: r["City"] == "Pittsburgh" and r["State"] == "PA"):
        v, m = latest(row, months)
        if v is not None:
            raw[row["RegionName"]] = {"zhvi": v, "zhviDate": m}
    out = {ZILLOW_TO_CITY.get(k, k): v for k, v in raw.items()}
    if "Oakland" in out:
        oak = out.pop("Oakland")
        for child in OAKLAND_CHILDREN:
            out.setdefault(child, dict(oak))
    return dict(sorted(out.items())), len(raw)


def load_zori():
    out = {}
    for row, months in read_zillow(ZORI_FILE, lambda r: r["State"] == "PA" and r["CountyName"] == "Allegheny County"):
        v, m = latest(row, months)
        if v is not None:
            out[row["RegionName"].zfill(5)] = {"zori": v, "zoriDate": m}
    return dict(sorted(out.items()))


def norm_zip(z):
    z = str(z or "").strip()[:5]
    return z if len(z) == 5 and z.isdigit() else None


def fetch_zips(pins):
    """PARID -> 5-digit PROPERTYZIP, from build.py's cache when present, else the WPRDC datastore."""
    cached = json.loads(ZIP_CACHE.read_text()) if ZIP_CACHE.exists() else {}
    assess_path = RAW / "assessments.json"
    if assess_path.exists():
        for pid, rec in json.loads(assess_path.read_text()).items():
            if rec and rec.get("PROPERTYZIP") and pid not in cached:
                cached[pid] = norm_zip(rec["PROPERTYZIP"])
    missing = [p for p in pins if p not in cached]
    if missing:
        log(f"PROPERTYZIP: fetching {len(missing)} PARIDs ({len(cached)} cached)")
    url = f"{WPRDC}/api/3/action/datastore_search"
    for i in range(0, len(missing), 200):
        chunk = missing[i:i + 200]
        body = {"resource_id": ASSESS_RESOURCE, "filters": {"PARID": chunk},
                "fields": ["PARID", "PROPERTYZIP"], "limit": len(chunk) * 2}
        for attempt in range(3):
            try:
                r = requests.post(url, json=body, headers=UA, timeout=90)
                r.raise_for_status()
                recs = r.json()["result"]["records"]
                break
            except Exception as e:
                log(f"  batch {i // 200} attempt {attempt + 1} failed: {e}")
                time.sleep(2 * (attempt + 1))
        else:
            continue
        for p in chunk:
            cached.setdefault(p, None)
        for rec in recs:
            cached[rec["PARID"]] = norm_zip(rec.get("PROPERTYZIP"))
        if (i // 200) % 10 == 0:
            log(f"  {i + len(chunk)}/{len(missing)}")
            ZIP_CACHE.write_text(json.dumps(cached))
        time.sleep(0.2)
    ZIP_CACHE.write_text(json.dumps(cached))
    return cached


def main():
    RAW.mkdir(exist_ok=True)
    ensure(ZHVI_FILE, ZHVI_URL)
    ensure(ZORI_FILE, ZORI_URL)
    lots = json.loads(LOTS.read_text())["lots"]

    by_nbhd, zillow_count = load_zhvi()
    by_zip = load_zori()
    zips = fetch_zips([l["id"] for l in lots])
    # Only ZIPs with a ZORI are kept: lotZip exists to find a rent comp, and 11k full
    # entries would push comps.json past its 300 KB budget.
    lot_zip = {l["id"]: zips[l["id"]] for l in lots if zips.get(l["id"]) in by_zip}
    zip_found = sum(1 for l in lots if zips.get(l["id"]))
    zip_no_zori = Counter(zips[l["id"]] for l in lots if zips.get(l["id"]) and zips[l["id"]] not in by_zip)

    zhvi_month = max((v["zhviDate"] for v in by_nbhd.values()), default="")
    zori_month = max((v["zoriDate"] for v in by_zip.values()), default="")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sources": [
            {
                "name": f"Zillow Home Value Index (ZHVI), all homes, mid tier, smoothed, seasonally adjusted, by neighborhood ({ZHVI_NAME})",
                "url": ZILLOW_PAGE,
                "vintage": f"latest month {zhvi_month}; {len(by_nbhd)} Pittsburgh neighborhoods; retrieved {today} from {ZHVI_URL}",
            },
            {
                "name": f"Zillow Observed Rent Index (ZORI), all homes plus multifamily, smoothed, by ZIP ({ZORI_NAME})",
                "url": ZILLOW_PAGE,
                "vintage": f"latest month {zori_month}; {len(by_zip)} Allegheny County ZIPs; retrieved {today} from {ZORI_URL}",
            },
            {
                "name": "Allegheny County Property Assessments: PROPERTYZIP (WPRDC), used to place each lot in a ZIP",
                "url": f"{WPRDC}/dataset/property-assessments",
                "vintage": f"datastore {ASSESS_RESOURCE}; {zip_found}/{len(lots)} lots have a ZIP, {len(lot_zip)} in a ZIP with ZORI (only those are listed); retrieved {today}",
            },
        ],
        "byNeighborhood": by_nbhd,
        "byZip": by_zip,
        "lotZip": lot_zip,
    }
    OUT.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False))
    report(doc, lots, zillow_count, zip_found, zip_no_zori)


def report(doc, lots, zillow_count, zip_found, zip_no_zori):
    by_nbhd, by_zip, lot_zip = doc["byNeighborhood"], doc["byZip"], doc["lotZip"]
    print(f"file: {OUT} ({OUT.stat().st_size / 1e3:.0f} KB)")
    print(f"ZHVI: {zillow_count} Zillow Pittsburgh neighborhoods -> {len(by_nbhd)} City names")
    with_zhvi = sum(1 for l in lots if l["neighborhood"] in by_nbhd)
    print(f"lots with ZHVI: {with_zhvi}/{len(lots)}")
    uncovered = Counter(l["neighborhood"] or "(blank)" for l in lots if l["neighborhood"] not in by_nbhd)
    print("neighborhoods without ZHVI (lots):", uncovered.most_common())
    print(f"lots with ZIP: {zip_found}/{len(lots)}; lots with ZORI: {len(lot_zip)}/{len(lots)}")
    print("lot ZIPs without ZORI (lots):", zip_no_zori.most_common())
    for s in doc["sources"]:
        print("source:", s)


if __name__ == "__main__":
    main()
