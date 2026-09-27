"""Build public/data/lots.json for ByRight PGH.

Run from the repo root:
    python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install shapely requests
    pipeline/.venv/bin/python pipeline/build.py

Raw downloads are cached in pipeline/raw/ and only fetched when missing.
Delete a file in pipeline/raw/ to force a refresh.
"""

import csv
import json
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests
import shapely
from shapely.geometry import shape

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE.parent / "public" / "data" / "lots.json"
UA = {"User-Agent": "ByRightPGH-hackathon-pipeline/1.0"}

WPRDC = "https://data.wprdc.org"
CITY_CSV = HERE / "city_owned.csv"
CITY_RESOURCE = "e1dcee82-9179-4306-8167-5891915b62a7"
CITY_DUMP = f"{WPRDC}/datastore/dump/{CITY_RESOURCE}"
ASSESS_RESOURCE = "65855e14-549e-4992-b5be-d629afc676fa"
ASSESS_FIELDS = ["PARID", "LOTAREA", "FAIRMARKETLAND", "LEGAL1", "LEGAL2", "USEDESC", "ASOFDATE"]

HAZARD_LAYERS = {
    "slopes": {
        "file": RAW / "slopes.geojson",
        "url": f"{WPRDC}/dataset/0f643c56-1c53-4c88-824d-3a3876c0d3a0/resource/5ce91a56-0799-46ea-9585-13fa8db5979e/download/slopes.geojson",
        "resource": "5ce91a56-0799-46ea-9585-13fa8db5979e",
        "page": f"{WPRDC}/dataset/25-or-greater-slope",
        "name": "City of Pittsburgh 25% or Greater Slope (WPRDC)",
    },
    "undermined": {
        "file": RAW / "undermined.geojson",
        "url": f"{WPRDC}/dataset/ea849f53-0aa9-4621-b9fb-e8dc323d3a9e/resource/e1d96015-818f-46fb-88dd-85c20eacb96c/download/undermined.geojson",
        "resource": "e1d96015-818f-46fb-88dd-85c20eacb96c",
        "page": f"{WPRDC}/dataset/undermined-areas",
        "name": "City of Pittsburgh Undermined Areas (WPRDC)",
    },
}

ZONING = {
    "file": RAW / "zoning.geojson",
    "url": f"{WPRDC}/dataset/01773197-baba-4f5e-aa77-ae87a04afafc/resource/6127f35e-f36b-4a53-80b3-f4409609e9df/download/zoning.geojson",
    "resource": "6127f35e-f36b-4a53-80b3-f4409609e9df",
    "page": f"{WPRDC}/dataset/01773197-baba-4f5e-aa77-ae87a04afafc",
    "name": "City of Pittsburgh Zoning Districts, zon_new (WPRDC)",
}

FEMA_SERVICE = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer"
FEMA_FILE = RAW / "fema_sfha.geojson"
PGH_BBOX = "-80.10,40.36,-79.86,40.50"

# "25X100", "33.40X125", "50XAVG126.07" (frontage x average depth)
FRONTAGE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*X\s*(?:AVG\.?\s*)?(\d+(?:\.\d+)?)", re.IGNORECASE)
LEGAL_WIDTH = 46  # LEGAL1..3 are fixed-width deed lines; text wraps mid-token


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def download(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return
    log(f"downloading {url}")
    r = requests.get(url, headers=UA, timeout=300)
    r.raise_for_status()
    dest.write_bytes(r.content)


def resource_last_modified(resource_id):
    try:
        r = requests.get(f"{WPRDC}/api/3/action/resource_show", params={"id": resource_id}, headers=UA, timeout=30)
        r.raise_for_status()
        res = r.json()["result"]
        return (res.get("last_modified") or res.get("metadata_modified") or "")[:10]
    except Exception as e:  # metadata is nice-to-have
        log(f"resource_show failed for {resource_id}: {e}")
        return ""


def title_case_address(s):
    words = []
    for w in re.sub(r"\s+", " ", s or "").strip().split(" "):
        if not w:
            continue
        if w[0].isdigit():
            words.append(w.lower())  # 1ST -> 1st, 12A -> 12a
        else:
            words.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    return " ".join(words)


def to_float(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f


def parse_frontage(legal1, legal2):
    """First dimension of the first 'A X B' in the legal description, in feet."""
    text = (legal1 or "").ljust(LEGAL_WIDTH) + (legal2 or "")
    m = FRONTAGE_RE.search(text)
    if not m:
        return None
    front = float(m.group(1))
    return round(front, 2) if 10 <= front <= 300 else None


# ---------- City-owned inventory ----------

def load_city_lots():
    rows = list(csv.DictReader(open(CITY_CSV, newline="", encoding="utf-8")))
    vintage = max((r["last_updated"] for r in rows if r["last_updated"]), default="")
    lots, seen = [], set()
    skipped = Counter()
    for r in rows:
        if r["class"] != "Vacant Land":
            continue
        pin = (r["pin"] or "").strip()
        lat, lon = to_float(r["latitude"]), to_float(r["longitude"])
        if not pin:
            skipped["no PARID"] += 1
            continue
        if lat is None or lon is None or lat == 0 or lon == 0:
            skipped["no lat/lon"] += 1
            continue
        if pin in seen:
            skipped["duplicate PARID"] += 1
            continue
        seen.add(pin)
        lots.append({"row": r, "pin": pin, "lat": lat, "lon": lon})
    log(f"city-owned: {len(rows)} rows, {len(lots)} vacant lots kept, skipped {dict(skipped)}")
    return lots, vintage, skipped


# ---------- County assessments ----------

def fetch_assessments(pins):
    cache = RAW / "assessments.json"
    cached = json.loads(cache.read_text()) if cache.exists() else {}
    missing = [p for p in pins if p not in cached]
    if missing:
        log(f"assessments: fetching {len(missing)} PARIDs ({len(cached)} cached)")
    url = f"{WPRDC}/api/3/action/datastore_search"
    batch = 200
    failures = 0
    for i in range(0, len(missing), batch):
        chunk = missing[i:i + batch]
        body = {
            "resource_id": ASSESS_RESOURCE,
            "filters": {"PARID": chunk},
            "fields": ASSESS_FIELDS,
            "limit": len(chunk) * 2,
        }
        for attempt in range(3):
            try:
                r = requests.post(url, json=body, headers=UA, timeout=90)
                r.raise_for_status()
                recs = r.json()["result"]["records"]
                break
            except Exception as e:
                log(f"  batch {i // batch} attempt {attempt + 1} failed: {e}")
                time.sleep(2 * (attempt + 1))
        else:
            failures += 1
            continue
        for p in chunk:
            cached.setdefault(p, None)  # mark as looked up even if absent
        for rec in recs:
            cached[rec["PARID"]] = {k: rec.get(k) for k in ASSESS_FIELDS}
        if (i // batch) % 10 == 0:
            log(f"  {i + len(chunk)}/{len(missing)}")
            cache.write_text(json.dumps(cached))
        time.sleep(0.3)
    cache.write_text(json.dumps(cached))
    return cached, failures


# ---------- Hazards ----------

def load_polygons(path):
    gj = json.loads(Path(path).read_text())
    geoms = []
    for f in gj["features"]:
        if not f.get("geometry"):
            continue
        g = shape(f["geometry"])
        if g.is_empty:
            continue
        if not g.is_valid:
            g = shapely.make_valid(g)
        geoms.append(g)
    return geoms


def flag_points(points, polygons):
    """Return a boolean list: point i falls in (or on) any polygon."""
    hit = [False] * len(points)
    if not polygons:
        return hit
    tree = shapely.STRtree(polygons)
    pt_idx, _ = tree.query(points, predicate="intersects")
    for i in set(pt_idx.tolist()):
        hit[i] = True
    return hit


def fetch_fema():
    if FEMA_FILE.exists() and FEMA_FILE.stat().st_size > 0:
        return True
    url = f"{FEMA_SERVICE}/28/query"
    feats, offset, page = [], 0, 500
    t0 = time.time()
    while True:
        params = {
            "where": "SFHA_TF='T'",
            "geometry": PGH_BBOX,
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF,DFIRM_ID",
            "outSR": "4326",
            "returnGeometry": "true",
            "resultOffset": offset,
            "resultRecordCount": page,
            "orderByFields": "OBJECTID",
            "f": "geojson",
        }
        r = requests.get(url, params=params, headers=UA, timeout=180)
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(data["error"])
        got = data.get("features", [])
        feats.extend(got)
        log(f"  FEMA: {len(feats)} features ({time.time() - t0:.0f}s)")
        if len(got) < page and not data.get("exceededTransferLimit") and not data.get("properties", {}).get("exceededTransferLimit"):
            break
        if not got:
            break
        offset += len(got)
        time.sleep(0.3)
    FEMA_FILE.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    return True


def fema_vintage():
    """Latest FIRM panel effective date in the bbox (NFHL layer 3), best effort."""
    try:
        r = requests.get(f"{FEMA_SERVICE}/3/query", params={
            "where": "1=1", "geometry": PGH_BBOX, "geometryType": "esriGeometryEnvelope",
            "inSR": "4326", "returnGeometry": "false", "outFields": "EFF_DATE", "f": "json",
        }, headers=UA, timeout=60)
        feats = r.json().get("features", [])
        now_ms = time.time() * 1000
        # 9999-09-09 is an NFHL placeholder for panels without a date
        dates = [d for f in feats if (d := f["attributes"].get("EFF_DATE")) and d < now_ms]
        if dates:
            return datetime.fromtimestamp(max(dates) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    except Exception as e:
        log(f"FEMA vintage lookup failed: {e}")
    return ""


# ---------- Zoning map cross-check ----------

def norm_zone(z):
    z = re.sub(r"\s+", "", z or "").upper()
    return z or None


def zone_at_points(points):
    """zon_new of the City zoning polygon under each point, or None (no polygon, or blank zon_new)."""
    download(ZONING["url"], ZONING["file"])
    gj = json.loads(ZONING["file"].read_text())
    geoms, zones = [], []
    for f in gj["features"]:
        if not f.get("geometry"):
            continue
        g = shape(f["geometry"])
        if g.is_empty:
            continue
        if not g.is_valid:
            g = shapely.make_valid(g)
        geoms.append(g)
        zones.append(norm_zone(f["properties"].get("zon_new")))
    log(f"zoning: {len(geoms)} polygons")
    out = [None] * len(points)
    tree = shapely.STRtree(geoms)
    pt_idx, g_idx = tree.query(points, predicate="intersects")
    seen = {}
    for p, g in zip(pt_idx.tolist(), g_idx.tolist()):
        seen.setdefault(p, set()).add(zones[g])
    multi = 0
    for p, zs in seen.items():
        zs.discard(None)
        if len(zs) == 1:
            out[p] = zs.pop()
        elif len(zs) > 1:
            multi += 1  # point on a boundary between two districts: leave unresolved
    log(f"zoning: {sum(z is not None for z in out)}/{len(points)} points matched; {multi} on a district boundary left null")
    return out


def zone_agrees(inventory_zone, map_zone):
    """True/False when both sides name a district; None when either is missing."""
    inv = norm_zone(inventory_zone)
    if inv in (None, "UNKNOWN") or map_zone is None:
        return None
    return inv == map_zone


# ---------- Main ----------

def main():
    RAW.mkdir(exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lots, city_vintage, _ = load_city_lots()
    pins = [l["pin"] for l in lots]

    # Assessments
    assess_ok = True
    try:
        assess, failures = fetch_assessments(pins)
        if failures:
            log(f"assessments: {failures} batches failed; those lots fall back to parc_sq_ft / null")
    except Exception as e:
        log(f"assessments lookup failed entirely: {e}")
        assess, failures, assess_ok = {}, -1, False
    asof = max((a["ASOFDATE"] for a in assess.values() if a and a.get("ASOFDATE")), default="")

    # Hazards
    points = shapely.points([(l["lon"], l["lat"]) for l in lots])
    hazard_vintage = {}
    for key, layer in HAZARD_LAYERS.items():
        download(layer["url"], layer["file"])
        polys = load_polygons(layer["file"])
        log(f"{key}: {len(polys)} polygons")
        layer["hits"] = flag_points(points, polys)
        hazard_vintage[key] = resource_last_modified(layer["resource"])

    map_zones = zone_at_points(points)
    zoning_vintage = resource_last_modified(ZONING["resource"])

    flood_hits, flood_ok = None, False
    try:
        fetch_fema()
        flood_polys = load_polygons(FEMA_FILE)
        log(f"FEMA SFHA: {len(flood_polys)} polygons")
        flood_hits = flag_points(points, flood_polys)
        flood_ok = True
    except Exception as e:
        log(f"FEMA NFHL fetch failed, floodZone = null for all lots: {e}")

    out_lots = []
    for i, l in enumerate(lots):
        r = l["row"]
        a = assess.get(l["pin"]) or {}
        lotarea = to_float(a.get("LOTAREA"))
        if not lotarea or lotarea <= 0:
            lotarea = to_float(r["parc_sq_ft"])
            if lotarea is not None and lotarea <= 0:
                lotarea = None
        land = to_float(a.get("FAIRMARKETLAND"))
        out_lots.append({
            "id": l["pin"],
            "address": title_case_address(r["address"]),
            "neighborhood": (r["neighborhood_name"] or "").strip(),
            "councilDistrict": (r["council_district"] or "").strip(),
            "ward": (r["ward"] or "").strip(),
            "lat": round(l["lat"], 6),
            "lon": round(l["lon"], 6),
            "zone": (r["zoned_as"] or "").strip() or "UNKNOWN",
            "zoneMap": map_zones[i],
            "zoneAgrees": zone_agrees(r["zoned_as"], map_zones[i]),
            "lotAreaSqFt": round(lotarea) if lotarea is not None else None,
            "frontageFt": parse_frontage(a.get("LEGAL1"), a.get("LEGAL2")),
            "landValue": round(land) if land is not None else None,
            "status": (r["current_status"] or "").strip(),
            "inventoryType": (r["inventory_type"] or "").strip(),
            "hazards": {
                "steepSlope": HAZARD_LAYERS["slopes"]["hits"][i],
                "undermined": HAZARD_LAYERS["undermined"]["hits"][i],
                "floodZone": flood_hits[i] if flood_ok else None,
            },
        })

    matched = sum(1 for p in pins if assess.get(p))
    assess_note = (
        f"ASOFDATE {asof}; matched {matched}/{len(pins)} PARIDs; FAIRMARKETLAND is the county's 2012 base-year assessed land value, not market value"
        if assess_ok and failures == 0 else
        f"ASOFDATE {asof or 'n/a'}; API lookup incomplete (matched {matched}/{len(pins)}); unmatched lots use City parc_sq_ft and null landValue/frontage"
    )
    sources = [
        {
            "name": "City of Pittsburgh City-Owned Properties, class 'Vacant Land' (WPRDC)",
            "url": f"{WPRDC}/dataset/city-owned-properties",
            "vintage": f"records last_updated through {city_vintage} (CSV dump {CITY_DUMP}, retrieved {today})",
        },
        {
            "name": "Allegheny County Property Assessments: LOTAREA, FAIRMARKETLAND, LEGAL1/LEGAL2 lot dimensions (WPRDC)",
            "url": f"{WPRDC}/dataset/property-assessments",
            "vintage": assess_note,
        },
    ]
    sources.append({
        "name": ZONING["name"] + " (cross-check of the inventory's zoned_as at the inventory point)",
        "url": ZONING["page"],
        "vintage": f"resource last modified {zoning_vintage or 'unknown'}; retrieved {today}",
    })
    for key, layer in HAZARD_LAYERS.items():
        sources.append({
            "name": layer["name"] + " (screening only)",
            "url": layer["page"],
            "vintage": f"resource last modified {hazard_vintage[key] or 'unknown'}; retrieved {today}",
        })
    if flood_ok:
        fv = fema_vintage()
        sources.append({
            "name": "FEMA National Flood Hazard Layer, Special Flood Hazard Areas (SFHA_TF='T', layer 28) (screening only)",
            "url": f"{FEMA_SERVICE}/28",
            "vintage": f"latest FIRM panel effective date in bbox {fv or 'unknown'}; retrieved {today}",
        })
    else:
        sources.append({
            "name": "FEMA National Flood Hazard Layer (NOT APPLIED: service unavailable, floodZone is null)",
            "url": f"{FEMA_SERVICE}/28",
            "vintage": f"attempted {today}",
        })

    doc = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sources": sources,
        "lots": out_lots,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False))
    report(OUT)


def report(path):
    doc = json.loads(Path(path).read_text())
    lots = doc["lots"]
    expected = ["id", "address", "neighborhood", "councilDistrict", "ward", "lat", "lon", "zone", "zoneMap", "zoneAgrees", "lotAreaSqFt",
                "frontageFt", "landValue", "status", "inventoryType", "hazards"]
    assert set(doc) == {"generatedAt", "sources", "lots"}
    assert all(list(l) == expected for l in lots)
    assert all(set(l["hazards"]) == {"steepSlope", "undermined", "floodZone"} for l in lots)
    assert len({l["id"] for l in lots}) == len(lots)
    print(f"file: {path} ({path.stat().st_size / 1e6:.2f} MB)")
    print(f"lots: {len(lots)}")
    print("top zones:", Counter(l["zone"] for l in lots).most_common(15))
    agree = Counter(l["zoneAgrees"] for l in lots)
    compared = agree[True] + agree[False]
    print(f"zoning map vs inventory: {agree[True]}/{compared} agree ({100 * agree[True] / max(compared, 1):.1f}%), "
          f"{agree[False]} disagree, {agree[None]} not compared (inventory zone blank or no map polygon)")
    print("top disagreements (inventory -> map):",
          Counter((l["zone"], l["zoneMap"]) for l in lots if l["zoneAgrees"] is False).most_common(15))
    for h in ("steepSlope", "undermined", "floodZone"):
        print(f"{h}:", Counter(l["hazards"][h] for l in lots))
    for k in ("lotAreaSqFt", "frontageFt", "landValue"):
        print(f"{k} non-null:", sum(1 for l in lots if l[k] is not None))
    for s in doc["sources"]:
        print("source:", s)


if __name__ == "__main__":
    main()
